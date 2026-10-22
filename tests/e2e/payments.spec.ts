import { expect, test, type Page } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { FAKE_MONREM_PORT, signed, startFakeMonrem } from './fake-monrem'
import { newAccount, onceAppDialog, sql } from './helpers'

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
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
)
const cron = createHmac('sha256', `cron:${env.KHMA_ENCRYPTION_KEY}`).update('tick').digest('hex')
const paidUntil = () => Number(sql(`select extract(epoch from "paidUntil") from "Account" where id='${accountId}'`))
const DAY = 86_400

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
  // The first payment asks for the billing address Monrem needs.
  const form = page.getByRole('dialog', { name: 'Billing address' })
  // A magic-link user's name is their email's nickname: not offered as the card name.
  await expect(form.getByLabel('First name')).toHaveValue('')
  await expect(form.getByLabel('Last name')).toHaveValue('')
  await form.getByLabel('First name').fill('Nino')
  await form.getByLabel('Last name').fill('Beridze')
  await form.getByLabel('Street and number').fill('1 Rustaveli Ave')
  await form.getByLabel('City').fill('Tbilisi')
  await form.getByLabel('State / region').fill('Tbilisi')
  await form.getByLabel('Postal code').fill('0108')
  await expect(form.getByLabel('Country', { exact: true })).toHaveValue('GE')
  // The phone code follows the country; an impossible number is refused.
  await expect(form.getByLabel('Phone country code')).toHaveValue('GE')
  await expect(form.getByLabel('Phone', { exact: true })).toHaveAttribute('placeholder', '555 12 34 56')
  await form.getByLabel('Phone', { exact: true }).fill('123')
  await form.getByRole('button', { name: 'Continue to payment' }).click()
  await expect(form.getByRole('alert')).toHaveText('Enter a valid phone number')
  await form.getByLabel('Phone', { exact: true }).fill('555 12-34-56')
  await form.getByRole('button', { name: 'Continue to payment' }).click()
  await page.waitForURL(new RegExp(`127.0.0.1:${FAKE_MONREM_PORT}/pay/`))
  await expect(page.getByRole('heading', { name: 'Pay 9.44 USD' })).toBeVisible()
  const [id] = lastPayment()
  const order = monrem.orders.get(id)!
  expect(order.body).toMatchObject({ amount: 944, currency: 'USD', callback_url: webhook, billing_street: '1 Rustaveli Ave', billing_city: 'Tbilisi', billing_post_code: '0108', billing_country: 'GE', customer_phone: '555123456', customer_phone_code: '995', customer_first_name: 'Nino', customer_last_name: 'Beridze', billing_first_name: 'Nino', billing_last_name: 'Beridze' })
  expect(order.body).toMatchObject({ billing_state: 'Tbilisi' })
  expect(String(order.body.return_url)).toContain(`/pay/done?payment=${id}`)

  await page.getByRole('link', { name: 'Pay now' }).click()
  await page.waitForURL(/\/app\/credits\?payment=/)
  await expect(page.getByText('Payment received — 100 credits added.')).toBeVisible()
  expect(balance()).toBe(before + 100)
  await expect(page.getByText('Billing: Nino Beridze, 1 Rustaveli Ave, Tbilisi, Tbilisi, 0108, Georgia · +995 555 12 34 56')).toBeVisible()
  expect(lastPayment().slice(1)).toEqual(['APPROVED', 'PACK', '944', 'USD', 'true'])
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
  // An address saved before the phone and state were asked for: the form comes back
  // filled in, the name from a real profile name.
  sql(`update "Account" set "billingAddress"='{"street":"1 Rustaveli Ave","city":"Tbilisi","postCode":"0108","country":"GE"}' where id='${accountId}'`)
  sql(`update "User" set name='Nino Beridze' where id in (select "userId" from "AccountMember" where "accountId"='${accountId}')`)
  await page.goto('/app/credits')
  await page.getByRole('list', { name: 'Credit packs' }).getByRole('listitem').first().getByRole('button', { name: 'Buy' }).click()
  const form = page.getByRole('dialog', { name: 'Billing address' })
  await expect(form.getByLabel('Street and number')).toHaveValue('1 Rustaveli Ave')
  await expect(form.getByLabel('First name')).toHaveValue('Nino')
  await expect(form.getByLabel('Last name')).toHaveValue('Beridze')
  await form.getByLabel('State / region').fill('Tbilisi')
  await form.getByLabel('Phone', { exact: true }).fill('555 12 34 56')
  await form.getByRole('button', { name: 'Continue to payment' }).click()
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

  // Correctly signed (a leaked API password) but never paid: Monrem's API says
  // PENDING, so nothing is booked.
  await page.goto('/app/credits')
  await page.getByRole('list', { name: 'Credit packs' }).getByRole('listitem').first().getByRole('button', { name: 'Buy' }).click()
  await page.waitForURL(/\/pay\//)
  const [unpaid, , , cents, cur] = lastPayment()
  const faked = await request.post(webhook, { data: signed({ order_id: unpaid, status: 'APPROVED', amount: Number(cents), currency: cur }) })
  expect(faked.status()).toBe(200)
  expect(lastPayment()[1]).toBe('PENDING')
  expect(balance()).toBe(before)
})

test('when Monrem allows framing, the payment page opens in a window on our page', async () => {
  const before = balance()
  monrem.allowFraming(true)
  try {
    await page.goto('/app/credits')
    await page.getByRole('list', { name: 'Credit packs' }).getByRole('listitem').first().getByRole('button', { name: 'Buy' }).click()
    const pay = page.getByRole('dialog', { name: 'Card payment' })
    await expect(pay).toBeVisible()
    expect(page.url()).toMatch(/\/app\/credits$/)
    const frame = page.frameLocator('iframe[title="Monrem payment"]')
    await expect(frame.getByRole('heading', { name: 'Pay 9.44 USD' })).toBeVisible()
    // Paid inside the frame: the return page takes over the tab.
    await frame.getByRole('link', { name: 'Pay now' }).click()
    await page.waitForURL(/\/app\/credits\?payment=/)
    await expect(page.getByText('Payment received — 100 credits added.')).toBeVisible()
    expect(page.frames()).toHaveLength(1)
    expect(balance()).toBe(before + 100)
  } finally {
    monrem.allowFraming(false)
  }
})

test('during a paid period a dearer plan is bought, not picked; the unused time is converted', async () => {
  // Paid Start with about 30 days left.
  sql(`update "Account" set plan='STARTER', "billingCycle"='MONTHLY', "paidUntil"=now() + interval '30 days' where id='${accountId}'`)
  await page.goto('/app/plan')
  await page.getByRole('button', { name: 'Upgrade to Agency' }).click()
  await page.waitForURL(/\/app\/credits\?upgrade=AGENCY/)
  // Nothing changed yet.
  expect(sql(`select plan from "Account" where id='${accountId}'`)).toBe('STARTER')
  const box = page.getByRole('region', { name: 'Upgrade your plan' })
  // 30 days of $29 Start are worth about 4 days of $199 Agency.
  await expect(box.getByText(/The (29|30) days left of Start become 4 days of Agency/)).toBeVisible()
  await box.getByRole('button', { name: 'Pay for Agency · $199 + VAT / month' }).click()
  await page.waitForURL(/\/pay\//)
  await expect(page.getByRole('heading', { name: 'Pay 234.82 USD' })).toBeVisible()
  await page.getByRole('link', { name: 'Pay now' }).click()
  await expect(page.getByText(/Payment received — your plan is paid until/)).toBeVisible()
  expect(sql(`select plan from "Account" where id='${accountId}'`)).toBe('AGENCY')
  // A month from today plus the converted days.
  const days = Number(sql(`select extract(epoch from "paidUntil" - now()) / 86400 from "Account" where id='${accountId}'`))
  expect(days).toBeGreaterThan(31)
  expect(days).toBeLessThan(37)

  // A cheaper plan applies at once, without payment.
  await page.goto('/app/plan')
  await page.getByRole('button', { name: 'Switch to Start' }).click()
  await page.waitForURL(/\/app\/credits$/)
  expect(sql(`select plan from "Account" where id='${accountId}'`)).toBe('STARTER')
})

test('super admins get ₾1 test payments for a pack and a plan month; others never see them', async () => {
  const testPayments = page.getByRole('region', { name: 'Test payments' })
  await page.goto('/app/credits')
  await expect(page.getByRole('heading', { name: 'Buy more credits' })).toBeVisible()
  await expect(testPayments).toHaveCount(0)

  sql(`update "User" set role='SUPER_ADMIN' where id in (select "userId" from "AccountMember" where "accountId"='${accountId}')`)
  try {
    const before = balance()
    await page.reload()
    await testPayments.getByRole('button', { name: /^Test pack · 10 credits for 1\.00/ }).click()
    await page.waitForURL(/\/pay\//)
    await expect(page.getByRole('heading', { name: 'Pay 1.00 USD' })).toBeVisible()
    await page.getByRole('link', { name: 'Pay now' }).click()
    await expect(page.getByText('Payment received — 10 credits added.')).toBeVisible()
    expect(balance()).toBe(before + 10)
    expect(lastPayment().slice(1)).toEqual(['APPROVED', 'PACK', '100', 'USD', 'true'])

    // A month of the current plan, booked like a real one.
    const until = paidUntil()
    await testPayments.getByRole('button', { name: /^Test plan · .* 1 month for 1\.00/ }).click()
    await page.waitForURL(/\/pay\//)
    await expect(page.getByRole('heading', { name: 'Pay 1.00 USD' })).toBeVisible()
    await page.getByRole('link', { name: 'Pay now' }).click()
    await expect(page.getByText(/Payment received — your plan is paid until/)).toBeVisible()
    expect(lastPayment().slice(1)).toEqual(['APPROVED', 'PLAN', '100', 'USD', 'true'])
    expect(paidUntil() - until).toBeGreaterThan(27 * DAY)
  } finally {
    sql(`update "User" set role='USER' where id in (select "userId" from "AccountMember" where "accountId"='${accountId}')`)
  }
})

test.describe('auto-renewal', () => {
  test.beforeAll(() => {
    // Start monthly renews at the same $34.22 ($29 + VAT); the yearly Monrem plan has an old price, so it can't.
    sql(`update "Account" set plan='STARTER' where id='${accountId}'`)
    sql(`insert into "Setting"(key, value, "updatedAt") values ('monremPlans', '{"STARTER_MONTHLY":"ref-starter-m","STARTER_YEARLY":"ref-starter-y-old"}', now()) on conflict (key) do update set value=excluded.value`)
  })
  test.afterAll(() => sql(`delete from "Setting" where key='monremPlans'`))

  test('subscribe monthly; Monrem renews with and without a callback; each charge books one month', async () => {
    await page.goto('/app/credits')
    await expect(page.getByLabel('Renew automatically — cancel any time')).toBeChecked()
    // The yearly price differs from Monrem's plan: that one is paid once only.
    await expect(page.getByRole('button', { name: /^1 year · \$/ })).toBeVisible()
    const start = paidUntil()
    await page.getByRole('button', { name: '$29 + VAT / month' }).click()
    await page.waitForURL(/\/pay\//)
    await expect(page.getByRole('heading', { name: 'Pay 34.22 USD' })).toBeVisible()
    await page.getByRole('link', { name: 'Pay now' }).click()
    await expect(page.getByText(/your plan is paid until .* and renews automatically/)).toBeVisible()
    await expect(page.getByText(/^Renews automatically every month/)).toBeVisible()

    const [first] = lastPayment()
    const subId = sql(`select "subscriptionId" from "Payment" where id='${first}'`)
    expect(sql(`select "recurringRef" from "Payment" where id='${first}'`)).toBe('ref-starter-m')
    expect(sql(`select status||'|'||plan||'|'||cycle from "Subscription" where id='${subId}'`)).toBe('ACTIVE|STARTER|MONTHLY')
    const afterFirst = paidUntil()
    expect(afterFirst - start).toBeGreaterThan(27 * DAY)

    // Next month: Monrem charges and calls back.
    await monrem.renew(subId)
    await expect.poll(() => sql(`select count(*) from "Payment" where "subscriptionId"='${subId}' and status='APPROVED' and "fulfilledAt" is not null`)).toBe('2')
    const afterSecond = paidUntil()
    expect(afterSecond - afterFirst).toBeGreaterThan(27 * DAY)

    // A charge whose callback never comes is found by the hourly subscription check — once.
    await monrem.renew(subId, { notify: false })
    const tick = () => page.request.post('/api/cron/tick?subscriptions=1', { headers: { 'x-khma-cron': cron } }).then((r) => r.json())
    expect((await tick()).subscriptions).toBe(1)
    expect(sql(`select count(*) from "Payment" where "subscriptionId"='${subId}' and status='APPROVED'`)).toBe('3')
    expect(paidUntil() - afterSecond).toBeGreaterThan(27 * DAY)
    const third = paidUntil()
    await tick()
    expect(paidUntil()).toBe(third)
    expect(sql(`select count(*) from "Payment" where "subscriptionId"='${subId}'`)).toBe('3')
  })

  test('turning auto-renewal off cancels it at Monrem; the paid period stays', async () => {
    const until = paidUntil()
    const subId = sql(`select id from "Subscription" where "accountId"='${accountId}' and status='ACTIVE'`)
    await page.goto('/app/credits')
    onceAppDialog(page, (d) => d.accept())
    await page.getByRole('button', { name: 'Turn off auto-renewal' }).click()
    await expect(page.getByLabel('Renew automatically — cancel any time')).toBeVisible()
    expect(sql(`select status from "Subscription" where id='${subId}'`)).toBe('CANCELLED')
    expect(monrem.cancelled).toContain(subId)
    expect(paidUntil()).toBe(until)
  })
})
