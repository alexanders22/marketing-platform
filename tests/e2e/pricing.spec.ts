import { expect, test, type Page } from '@playwright/test'
import { newAccount, sql } from './helpers'

// Credits balance in the header; super admin prices with live margins.
// Only the Cinema clip price is changed (and put back) — other specs run in
// parallel and rely on the default prices.

test.describe.configure({ mode: 'serial' })
let page: Page
let accountId = ''

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  const { email } = await newAccount(page, 'pricing', 'Price Lab')
  sql(`update "User" set role='SUPER_ADMIN' where email='${email}'`)
  accountId = sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${email}'`)
})
test.afterAll(async () => {
  // Defaults back for everyone else.
  sql(`delete from "Setting" where key='pricing'`)
  await page.close()
})

test('the balance is in the header, amber when low, red at zero', async () => {
  await page.goto('/app/dashboard')
  const badge = page.getByRole('link', { name: /50 credits left/ })
  await expect(badge).toBeVisible()
  await expect(page.getByRole('link', { name: 'Get credits' })).toHaveAttribute('href', '/app/plan')
  sql(`update "Account" set "creditBalance"=5 where id='${accountId}'`)
  await page.reload()
  await expect(page.getByRole('link', { name: /5 credits left/ })).toHaveClass(/bg-amber-50/)
  sql(`update "Account" set "creditBalance"=0 where id='${accountId}'`)
  await page.reload()
  await expect(page.getByRole('link', { name: /0 credits left/ })).toHaveClass(/bg-red-50/)
  sql(`update "Account" set "creditBalance"=50 where id='${accountId}'`)
})

test('admin pricing: margins per plan, validation, saved prices reach the app', async () => {
  await page.goto('/admin/pricing')
  await expect(page.getByRole('heading', { name: 'Pricing & unit economics' })).toBeVisible()
  // Start: $29 without VAT / 200 credits.
  await expect(page.getByText(/\$29 ÷ 200 = \$0\.145/)).toBeVisible()
  const cinema = page.getByLabel('Credits for AI clip · Cinema (Veo 3.1)')
  await expect(cinema).toHaveValue('20')
  // 5 credits × $0.0796 net (Agency) − $0.40 cost → a loss, shown red.
  const row = page.locator('tr', { hasText: 'AI clip · Cinema' })
  const agency = row.locator('td').nth(6).locator('span').first()
  await expect(agency).not.toHaveClass(/text-red-600/)
  await cinema.fill('5')
  await expect(agency).toHaveClass(/text-red-600/)

  // Negative numbers can't be entered.
  await page.getByLabel('Cost of AI post text').fill('-1')
  await expect(page.getByLabel('Cost of AI post text')).toHaveValue('0')
  await page.getByLabel('Cost of AI post text').fill('0.002')

  await cinema.fill('12')
  await expect(agency).not.toHaveClass(/text-red-600/)
  await page.getByRole('button', { name: 'Save prices' }).click()
  await expect(page.getByText('Saved — new prices apply to the next charge')).toBeVisible()
  expect(sql(`select value->'actions'->'clipCinema'->>'credits' from "Setting" where key='pricing'`)).toBe('12')
  expect(sql(`select count(*) from "AdminLog" where action='pricing.update'`)).not.toBe('0')

  // The app shows the new price (super admins may use Veo on a trial).
  await page.goto('/app/studio?tab=video')
  await page.getByRole('button', { name: 'New Reel / Story video' }).click()
  await page.waitForURL(/\/app\/studio\/video\//)
  await page.getByRole('button', { name: 'Generate clip with AI' }).click()
  await expect(page.getByRole('radiogroup', { name: 'Clip quality' }).getByRole('radio', { name: /Cinema/ })).toContainText('12 cr/s')
})

test('admin pricing: an exchange rate fills in lari prices; each plan shows what it earns', async () => {
  sql(`delete from "Setting" where key in ('pricing','economics')`)
  await page.goto('/admin/pricing')
  await page.getByLabel('Lari per dollar').fill('2.8')
  // A dollar price fills in the lari price at the rate; a round lari price can still be typed.
  await page.getByLabel('Price of Start').fill('30')
  await expect(page.getByLabel('Start lari price')).toHaveValue('84')
  await page.getByLabel('Start lari price').fill('79')
  await page.getByLabel('Price of pack 1').fill('20')
  await expect(page.getByLabel('Pack 1 lari price')).toHaveValue('56')
  // Recalculating brings every lari price back to its dollar price × rate.
  await page.getByRole('button', { name: 'Recalculate all lari prices at ₾2.80' }).click()
  await expect(page.getByLabel('Start lari price')).toHaveValue('84')
  await expect(page.getByLabel('Business lari price')).toHaveValue('210')

  // Start, charged in dollars ($30 = ₾84): the customer pays ₾99.12, ₾15.12
  // of it VAT; 2.5% card fee on the payment and 1% tax = ₾3.32; then AI.
  const start = page.getByLabel('Start: what a month earns')
  await expect(start).toContainText('Customer pays₾99.12')
  await expect(start).toContainText('VAT 18% to the state−₾15.12')
  await expect(start).toContainText('Card fee and tax−₾3.32')
  await expect(start).toContainText(/You earn₾\d+\.\d\d · \d+%/)
  await expect(start).toContainText(/cover the fixed costs/)

  await page.getByRole('button', { name: 'Save prices' }).click()
  await expect(page.getByText('Saved — new prices apply to the next charge')).toBeVisible()
  expect(sql(`select (value->>'gelPerUsd')||'|'||(value->'plans'->'STARTER'->>'monthlyGel') from "Setting" where key='pricing'`)).toBe('2.8|84')
  // Back to the National Bank's rate.
  await page.getByRole('button', { name: 'Use the National Bank rate' }).click()
  await expect(page.getByLabel('Lari per dollar')).toHaveValue('')
  await page.getByRole('button', { name: 'Save prices' }).click()
  await expect(page.getByText('Saved — new prices apply to the next charge')).toBeVisible()
  expect(sql(`select coalesce(value->>'gelPerUsd','null') from "Setting" where key='pricing'`)).toBe('null')
})

