import { expect, test, type Page } from '@playwright/test'
import { newAccount, sql } from './helpers'

// Competitors: the list (add, edit, remove), and — with the real model —
// finding them on Google and the "us vs them" comparison.

test.describe.configure({ mode: 'serial' })
const AI = process.env.QA_STRATEGY_AI === '1'
let page: Page
let ws = ''

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  const { email } = await newAccount(page, 'rivals', 'Vake Bakery')
  ws = sql(`select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}'`)
  sql(`update "BrandKit" set website='https://example.com', description='Artisan bakery in Vake, Tbilisi: sourdough bread, croissants and custom birthday cakes with delivery.' where "workspaceId"='${ws}'`)
  sql(`update "Account" a set "creditBalance"=200 from "Workspace" w where w.id='${ws}' and a.id=w."accountId"`)
})
test.afterAll(async () => page.close())

test('add, edit and remove competitors; Brand has a Competitors tab', async () => {
  await page.goto('/app/dossier')
  await page.getByRole('navigation', { name: 'Brand' }).getByRole('link', { name: 'Competitors' }).click()
  await page.waitForURL(/\/app\/competitors$/)
  await page.getByRole('button', { name: 'Add competitor' }).click()
  await page.getByPlaceholder('Competitor name').fill('Lavash House')
  await page.getByPlaceholder('competitor.ge').fill('example.org')
  await page.getByPlaceholder(/Prices, offers/).fill('Cheaper bread (₾3), no delivery, slow replies on Instagram.')
  await page.getByRole('button', { name: 'Save' }).click()
  const list = page.getByRole('list', { name: 'Competitors' })
  await expect(list.getByText('Lavash House')).toBeVisible()
  expect(sql(`select website from "Competitor" where "workspaceId"='${ws}'`)).toBe('https://example.org')

  await page.getByRole('button', { name: 'Edit Lavash House' }).click()
  await page.getByPlaceholder('Competitor name').fill('Lavash House Tbilisi')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(list.getByText('Lavash House Tbilisi')).toBeVisible()

  await page.getByRole('button', { name: 'Add competitor' }).click()
  await page.getByPlaceholder('Competitor name').fill('Old Town Cakes')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(list.getByText('Old Town Cakes')).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Remove Old Town Cakes' }).click()
  await expect(list.getByText('Old Town Cakes')).toHaveCount(0)
  // The Ad Library link shows the ads they run now.
  await expect(list.getByRole('link', { name: 'Their ads ↗' })).toHaveAttribute('href', /facebook\.com\/ads\/library\/.*q=Lavash%20House%20Tbilisi/)
})

test('AI: find competitors on Google, compare, actions open prefilled', async () => {
  test.skip(!AI, 'set QA_STRATEGY_AI=1 to run against the real model')
  test.setTimeout(300_000)
  await page.goto('/app/competitors')
  await page.getByRole('button', { name: /Find with Google/ }).click()
  const found = page.getByRole('region', { name: 'Found competitors' })
  await expect(found).toBeVisible({ timeout: 120_000 })
  console.log('FOUND', await found.innerText())

  await page.getByRole('button', { name: /^Compare · \d+ credits?$/ }).click()
  const report = page.getByRole('region', { name: 'Comparison' })
  await expect(report).toBeVisible({ timeout: 240_000 })
  console.log('REPORT', (await report.innerText()).slice(0, 1500))
  await expect(report.getByRole('columnheader', { name: 'Vake Bakery' })).toBeVisible()
  await expect(report.getByText('Where you win')).toBeVisible()
  expect(sql(`select count(*) from "CompetitorReport" where "workspaceId"='${ws}'`)).toBe('1')
  expect(sql(`select "analyzedAt" is not null from "Competitor" where "workspaceId"='${ws}' and name like 'Lavash%'`)).toBe('t')
  // The dossier carries the comparison into every AI feature.
  const action = report.getByRole('link', { name: /Write a post|Plan a campaign/ }).first()
  if (await action.count()) {
    await action.click()
    await expect(page.locator('textarea').first()).not.toHaveValue('')
  }
})
