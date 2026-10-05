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
  // Starter: $29 / 300 credits.
  await expect(page.getByText(/\$29 ÷ 300 = \$0\.097/)).toBeVisible()
  const cinema = page.getByLabel('Credits for AI clip · Cinema (Veo 3.1)')
  await expect(cinema).toHaveValue('5')
  // 5 credits × $0.0398 (Agency) − $0.40 cost → a loss, shown red.
  const row = page.locator('tr', { hasText: 'AI clip · Cinema' })
  await expect(row.locator('td').nth(6).locator('span').first()).toHaveClass(/text-red-600/)

  // Negative numbers can't be entered.
  await page.getByLabel('Cost of AI post text').fill('-1')
  await expect(page.getByLabel('Cost of AI post text')).toHaveValue('0')
  await page.getByLabel('Cost of AI post text').fill('0.002')

  await cinema.fill('12')
  await expect(row.locator('td').nth(6).locator('span').first()).not.toHaveClass(/text-red-600/)
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
