import { expect, test, type Page } from '@playwright/test'
import { newAccount, sql } from './helpers'

// Money: every credit amount shows its ₾/$ value on hover, plans show a lari
// price, credit packs on the credits page, and Admin → Economics (margins
// and break-even). Global prices are not changed here — other specs rely on
// the defaults.

test.describe.configure({ mode: 'serial' })

let page: Page

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  const { email } = await newAccount(page, 'econ', 'Econ Co')
  sql(`update "User" set role='SUPER_ADMIN' where email='${email}'`)
})
test.afterAll(async () => {
  await page.close()
})

test('hovering a credit amount shows its value in lari and dollars', async () => {
  await page.goto('/app/credits')
  const badge = page.getByRole('link', { name: /50 credits left/ }).last()
  await badge.hover()
  await expect(page.getByRole('tooltip')).toHaveText(/^50 credits ≈ ₾[\d.]+ · \$4\.00$/)
  // Right by the pointer, not in the middle of the header.
  const b = (await badge.boundingBox())!
  const t = (await page.getByRole('tooltip').boundingBox())!
  expect(t.x + t.width / 2).toBeGreaterThan(b.x - 4)
  expect(t.x + t.width / 2).toBeLessThan(b.x + b.width + 4)
  expect(Math.abs(t.y + t.height - b.y) < 20 || Math.abs(t.y - (b.y + b.height)) < 20).toBe(true)
  // The empty header next to the badge is not a credit label: no hint in
  // the middle of the screen.
  await page.mouse.move(b.x - 120, b.y + b.height / 2)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  // A button label deep in the app too.
  await page.goto('/app/strategy/new')
  await page.getByRole('button', { name: /Build my plan · 5 credits/ }).hover()
  await expect(page.getByRole('tooltip')).toHaveText(/^5 credits ≈ ₾\d+\.\d\d · \$0\.40$/)
  await page.mouse.move(5, 500)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})

test('credits page: what the balance is worth, and packs to buy', async () => {
  await page.goto('/app/credits')
  await expect(page.getByText(/^worth ≈ ₾[\d.]+ · \$4\.00$/)).toBeVisible()
  const packs = page.getByRole('list', { name: 'Credit packs' }).getByRole('listitem')
  await expect(packs).toHaveCount(3)
  await expect(packs.nth(0)).toContainText('100 credits')
  await expect(packs.nth(0)).toContainText('₾22 · $8')
  await expect(packs.nth(1)).toContainText('Save 13%')
  await expect(packs.nth(2)).toContainText('Save 25%')
  await expect(packs.nth(2)).toContainText('₾16.25 per 100 credits')
  await expect(packs.nth(0).getByRole('button', { name: 'Buy' })).toBeDisabled()
})

test('plan prices show their fixed lari price (picker and landing)', async () => {
  await page.goto('/app/plan')
  await expect(page.getByText(/^\$15 \/ month₾39$/)).toBeVisible()
  await expect(page.getByText(/^\$29 \/ month₾79$/)).toBeVisible()
  await page.goto('/')
  await expect(page.locator('#pricing').getByText(/^₾\d+$/)).toHaveText(['₾39', '₾79', '₾219', '₾549'])
})

test('admin: plans and packs are editable; economics shows margins and break-even', async () => {
  await page.goto('/admin/pricing')
  await expect(page.getByLabel('Price of Team')).toHaveValue('79')
  await expect(page.getByLabel('Team lari price')).toHaveValue('219')
  await expect(page.getByLabel('Credits of Team')).toHaveValue('1200')
  await expect(page.getByLabel('Credits in pack 2')).toHaveValue('500')

  // Start from the defaults (an earlier run may have saved its numbers).
  sql(`delete from "Setting" where key='economics'`)
  await page.goto('/admin/economics')
  await expect(page.getByRole('heading', { name: 'Economics' })).toBeVisible()
  // Known numbers: one fixed cost of $1,000, no trials, 1 cent a credit.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^Remove / }).first().click()
  await page.getByLabel('Cost 1 name').fill('Salaries')
  await page.getByLabel('Salaries amount').fill('1000')
  await page.getByLabel('Salaries currency').selectOption('USD')
  await page.getByLabel(/^Free trials a month/).fill('0')
  await page.getByLabel('Customers paying yearly').fill('0')
  await page.getByLabel('AI cost of one credit').fill('0.01')
  // Team: 79 → 66.95 without VAT − 1.98 card fee − 0.67 tax − 6.00 AI (1,200 × 50%) = 58.30.
  const team = page.getByRole('row').filter({ hasText: /^Team/ })
  await expect(team).toContainText('$58.30')
  await expect(team).toContainText('87%')
  // 1,000 ÷ 58.30 → 18 Team customers alone.
  await expect(page.getByLabel('Break-even')).toContainText('Only Team: 18')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  expect(sql(`select value->'fixed'->0->>'amount' from "Setting" where key='economics'`)).toBe('1000')
  await page.screenshot({ path: '/tmp/economics.png', fullPage: true })
})
