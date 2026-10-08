import { expect, test, type Page } from '@playwright/test'
import { newAccount, sql, onceAppDialog } from './helpers'

// Several companies per account (switcher, plan limit) and the super admin
// panel: edit, credits, pause, open as admin, members, block, delete.

test.describe.configure({ mode: 'serial' })

let admin: Page
let customer: Page
let customerEmail = ''
let accountId = ''

const q = (s: string) => s.replace(/'/g, "''")

test.beforeAll(async ({ browser }) => {
  admin = await browser.newPage()
  const a = await newAccount(admin, 'sadmin', 'Admin HQ')
  sql(`update "User" set role='SUPER_ADMIN' where email='${q(a.email)}'`)
  customer = await browser.newPage()
  const c = await newAccount(customer, 'cust', 'Arca Development')
  customerEmail = c.email
  accountId = sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${q(customerEmail)}'`)
})
test.afterAll(async () => {
  await admin.close()
  await customer.close()
})

async function addCompanyManually(page: Page, name: string) {
  await page.goto('/onboarding/company')
  await expect(page.getByRole('heading', { name: 'Add a company' })).toBeVisible()
  await page.getByRole('button', { name: 'Set up manually' }).click()
  await page.getByRole('button', { name: /Continue/ }).click()
  await page.locator('input').first().fill(name)
  await page.getByRole('button', { name: /Continue/ }).click()
}

test('a customer adds a second company and switches between them', async () => {
  await addCompanyManually(customer, 'Arca Rentals')
  await customer.waitForURL(/\/app\/dashboard/)
  await expect(customer.getByRole('button', { name: 'Company: Arca Rentals' }).first()).toBeVisible()
  expect(sql(`select count(*) from "Workspace" where "accountId"='${accountId}'`)).toBe('2')

  // Switch back through the menu.
  await customer.getByRole('button', { name: 'Company: Arca Rentals' }).first().click()
  await customer.getByRole('list', { name: 'Companies' }).getByRole('button', { name: 'Arca Development' }).click()
  await expect(customer.getByRole('button', { name: 'Company: Arca Development' }).first()).toBeVisible()

  // Starter includes 2 companies: the third is refused before the form.
  await customer.goto('/onboarding/company')
  await expect(customer.getByRole('heading', { name: 'Company limit reached' })).toBeVisible()
  await expect(customer.getByText('Your plan includes 2 companies and you have 2. Upgrade to add more.')).toBeVisible()
  expect(sql(`select count(*) from "Workspace" where "accountId"='${accountId}'`)).toBe('2')
})

test('the admin panel is invisible to everyone else', async () => {
  const res = await customer.goto('/admin')
  expect(res?.status()).toBe(404)
  await customer.goto('/app/dashboard')
  await customer.getByRole('button', { name: /^Company:/ }).first().click()
  await expect(customer.getByRole('link', { name: 'Admin panel' })).toHaveCount(0)
})

test('super admin: find the company, edit the plan, book credits', async () => {
  await admin.goto('/app/dashboard')
  await admin.getByRole('button', { name: /^Company:/ }).first().click()
  await admin.getByRole('link', { name: 'Admin panel' }).first().click()
  await expect(admin.getByRole('heading', { name: 'Overview' })).toBeVisible()

  await admin.getByRole('link', { name: 'Companies', exact: true }).click()
  await admin.getByLabel('Search companies').fill(customerEmail)
  await admin.getByRole('button', { name: 'Search' }).click()
  await admin.getByRole('link', { name: 'Arca Development' }).click()
  await expect(admin.getByText('2 of 2 on this plan')).toBeVisible()

  await admin.getByLabel('Plan').selectOption('TEAM')
  await admin.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(admin.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  expect(sql(`select plan from "Account" where id='${accountId}'`)).toBe('TEAM')

  const before = Number(sql(`select "creditBalance" from "Account" where id='${accountId}'`))
  await admin.getByLabel('Amount').fill('120')
  await admin.getByLabel('Credit type').selectOption('PURCHASE')
  const ref = `Bank transfer #${Date.now()}`
  await admin.getByLabel('Note').last().fill(ref)
  await admin.getByRole('button', { name: 'Book credits' }).click()
  await expect(admin.getByText('+120 credits booked')).toBeVisible()
  expect(Number(sql(`select "creditBalance" from "Account" where id='${accountId}'`))).toBe(before + 120)
  // The ledger and the balance agree.
  expect(sql(`select sum(amount) from "CreditEntry" where "accountId"='${accountId}'`)).toBe(String(before + 120))

  // Below zero is refused.
  await admin.getByLabel('Amount').fill(String(-(before + 1000)))
  await admin.getByLabel('Note').last().fill('too much')
  await admin.getByRole('button', { name: 'Book credits' }).click()
  await expect(admin.getByText('The balance can not go below zero')).toBeVisible()

  await admin.goto('/admin/payments')
  await expect(admin.getByRole('cell', { name: new RegExp(ref) })).toBeVisible()
})

test('pause locks the customer out; resume lets them back', async () => {
  await admin.goto(`/admin/companies/${accountId}`)
  await admin.getByLabel('Reason (shown to admins only)').fill('unpaid invoice')
  await admin.getByRole('button', { name: 'Pause account' }).click()
  await expect(admin.getByText(/Paused since .* — unpaid invoice/)).toBeVisible()

  await customer.goto('/app/dashboard')
  await customer.waitForURL(/\/paused/)
  await expect(customer.getByRole('heading', { name: 'Arca Development is paused' })).toBeVisible()

  await admin.getByRole('button', { name: 'Resume account' }).click()
  await expect(admin.getByText(/Paused since/)).toHaveCount(0)
  await customer.goto('/app/dashboard')
  await expect(customer).toHaveURL(/\/app\/dashboard/)
})

test('open a company as super admin', async () => {
  await admin.goto(`/admin/companies/${accountId}`)
  await admin.locator('li', { hasText: 'Arca Rentals' }).getByRole('button', { name: 'Open in app' }).click()
  await admin.waitForURL(/\/app\/dashboard/)
  await expect(admin.getByText('Super admin view')).toBeVisible()
  await expect(admin.getByRole('button', { name: 'Company: Arca Rentals' }).first()).toBeVisible()
  await admin.getByRole('link', { name: 'Back to admin' }).click()
  await expect(admin).toHaveURL(new RegExp(`/admin/companies/${accountId}`))
})

test('block signs the user out; unblock lets them in', async () => {
  await admin.goto('/admin/users')
  await admin.getByLabel('Search users').fill(customerEmail)
  await admin.getByRole('button', { name: 'Search' }).click()
  await admin.getByRole('link', { name: /^cust-/ }).click()
  // Client button: wait for hydration before clicking under a loaded dev server.
  await admin.waitForLoadState('networkidle')
  onceAppDialog(admin, (d) => d.accept())
  await admin.getByRole('button', { name: 'Block' }).click()
  await expect(admin.getByText(/Blocked since/)).toBeVisible()
  expect(sql(`select count(*) from "Session" s join "User" u on u.id=s."userId" where u.email='${q(customerEmail)}'`)).toBe('0')

  await customer.goto('/app/dashboard')
  await customer.waitForURL(/\/login/)

  await admin.getByRole('button', { name: 'Unblock' }).click()
  await expect(admin.getByText(/Blocked since/)).toHaveCount(0)
})

test('delete a company, then the account', async () => {
  await admin.goto(`/admin/companies/${accountId}`)
  const rentals = admin.locator('li', { hasText: 'Arca Rentals' })
  await rentals.getByText('Rename or delete').click()
  const del = rentals.getByRole('button', { name: 'Delete company' })
  await expect(del).toBeDisabled()
  await rentals.getByLabel('Type Arca Rentals to delete the company').fill('Arca Rentals')
  await del.click()
  await expect(admin.locator('li', { hasText: 'Arca Rentals' })).toHaveCount(0)

  await admin.getByLabel('Type Arca Development to delete the account').fill('Arca Development')
  await admin.getByRole('button', { name: 'Delete account' }).click()
  await admin.waitForURL(/\/admin\/companies\?deleted=1/)
  expect(sql(`select count(*) from "Account" where id='${accountId}'`)).toBe('0')
  expect(sql(`select count(*) from "Workspace" where "accountId"='${accountId}'`)).toBe('0')
  expect(Number(sql(`select count(*) from "AdminLog" where "targetId"='${accountId}'`))).toBeGreaterThan(3)
})
