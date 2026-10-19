import { expect, test, type Page } from '@playwright/test'
import { FAKE_MONREM_PORT, signed, startFakeMonrem } from './fake-monrem'
import { newAccount, sql } from './helpers'

// Card payments through Monrem's hosted checkout (fake-monrem.ts): credit
// packs and plan periods, fulfilled exactly once from the callback, the
// customer's return or a status check; forged callbacks are refused.

test.describe.configure({ mode: 'serial' })

const monrem = startFakeMonrem()
let page: Page
let accountId: string
const balance = () => Number(sql(`select "creditBalance" from "Account" where id='${accountId}'`))
const lastPayment = () => sql(`select id||'|'||status||'|'||kind||'|'||amount||'|'||currency||'|'||(("fulfilledAt" is not null)::text) from "Payment" where "accountId"='${accountId}' order by "createdAt" desc limit 1`).split('|')
const webhook = `http://localhost:3100/api/payments/monrem`

test.beforeAll(async ({ browser }) => {
  await monrem.listen()
  page = await browser.newPage()
  const { email } = await newAccount(page, 'pay')
  accountId = sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${email}'`)
})
test.afterAll(async () => {
  await page.close()
  await monrem.close()
})

test('a credit pack: Monrem checkout, callback, credits added once', async () => {
  const before = balance()
  await page.goto('/app/credits')
  await page.getByRole('list', { name: 'Credit packs' }).getByRole('listitem').first().getByRole('button', { name: 'Buy' }).click()
  await page.waitForURL(new RegExp(`127.0.0.1:${FAKE_MONREM_PORT}/pay/`))
  await expect(page.getByRole('heading', { name: 'Pay 10.00 USD' })).toBeVisible()
  const [id] = lastPayment()
  const order = monrem.orders.get(id)!
  expect(order.body).toMatchObject({ amount: 1000, currency: 'USD', callback_url: webhook })
  expect(String(order.body.return_url)).toContain(`/app/credits?payment=${id}`)

  await page.getByRole('link', { name: 'Pay now' }).click()
  await page.waitForURL(/\/app\/credits\?payment=/)
  await expect(page.getByText('Payment received — 100 credits added.')).toBeVisible()
  expect(balance()).toBe(before + 100)
  expect(lastPayment().slice(1)).toEqual(['APPROVED', 'PACK', '1000', 'USD', 'true'])
  expect(sql(`select count(*) from "CreditEntry" where "idempotencyKey"='payment:${id}' and reason='PURCHASE' and amount=100`)).toBe('1')

  // Replayed callbacks and a reload never add credits twice.
  await monrem.callback(order)
  await monrem.callback(order)
  await page.reload()
  expect(balance()).toBe(before + 100)
})

test('a plan year: approved without a callback, picked up from the status on return', async () => {
  await page.goto('/app/credits')
  await page.getByRole('button', { name: /^1 year · \$/ }).click()
  await page.waitForURL(/\/pay\//)
  await page.getByRole('link', { name: 'Pay without callback' }).click()
  await page.waitForURL(/\/app\/credits\?payment=/)
  await expect(page.getByText(/Payment received — your plan is paid until/)).toBeVisible()
  const [, status, kind, , , fulfilled] = lastPayment()
  expect([status, kind, fulfilled]).toEqual(['APPROVED', 'PLAN', 'true'])
  // Paid for a year from today; the trial is over; this month's plan credits granted.
  expect(Number(sql(`select extract(day from "paidUntil" - now()) from "Account" where id='${accountId}'`))).toBeGreaterThan(360)
  expect(sql(`select "billingCycle" from "Account" where id='${accountId}'`)).toBe('YEARLY')
  expect(Number(sql(`select count(*) from "CreditEntry" where "accountId"='${accountId}' and "idempotencyKey" like 'plan:%'`))).toBe(1)
  await expect(page.getByText(/^Paid until /)).toBeVisible()
})

test('a declined card: nothing booked, the customer is told', async () => {
  const before = balance()
  await page.goto('/app/credits')
  await page.getByRole('list', { name: 'Credit packs' }).getByRole('listitem').first().getByRole('button', { name: 'Buy' }).click()
  await page.waitForURL(/\/pay\//)
  await page.getByRole('link', { name: 'Decline' }).click()
  await expect(page.getByText(/The payment didn.t go through/)).toBeVisible()
  expect(lastPayment().slice(1, 2)).toEqual(['DECLINED'])
  expect(balance()).toBe(before)
})

test('forged or tampered callbacks are refused', async ({ request }) => {
  const before = balance()
  const [id, , , amount, currency] = lastPayment()
  // Wrong signing key.
  const forged = await request.post(webhook, { data: signed({ order_id: id, status: 'APPROVED', amount: Number(amount), currency }, 'not-the-password') })
  expect(forged.status()).toBe(401)
  // Signed, but for a smaller amount than asked.
  const cheap = await request.post(webhook, { data: signed({ order_id: id, status: 'APPROVED', amount: 1, currency }) })
  expect(cheap.status()).toBe(200)
  expect(lastPayment()[1]).toBe('DECLINED')
  expect(balance()).toBe(before)
})
