import { expect, test, type Page } from '@playwright/test'
import { newAccount, sql } from './helpers'

// Brandbook: read the owner's PDF, or create three directions with AI;
// either fills the brand kit.

test.describe.configure({ mode: 'serial' })
const AI = process.env.QA_STRATEGY_AI === '1'
let page: Page
let ws = ''

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  const { email } = await newAccount(page, 'book', 'Forest Homes')
  ws = sql(`select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}'`)
  sql(`update "Account" a set "creditBalance"=100 from "Workspace" w where w.id='${ws}' and a.id=w."accountId"`)
})
test.afterAll(async () => page.close())

test('the Brand section has a Brandbook tab with both ways in', async () => {
  await page.goto('/app/dossier')
  await page.getByRole('navigation', { name: 'Brand' }).getByRole('link', { name: 'Brandbook' }).click()
  await page.waitForURL(/\/app\/brandbook$/)
  await expect(page.getByRole('button', { name: /I have a brandbook/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Create one with AI/ })).toBeVisible()
})

test('AI: upload a PDF brandbook → colours, fonts and voice in the brand kit', async ({ browser }) => {
  test.skip(!AI, 'set QA_STRATEGY_AI=1 to run against the real model')
  test.setTimeout(240_000)
  // A small brandbook PDF, printed from HTML.
  const maker = await browser.newPage()
  await maker.setContent(`<html><body style="font-family:Arial;padding:40px">
    <h1>Forest Homes — Brand Guidelines</h1>
    <h2>Colours</h2>
    <p>Primary: Forest Green #0F4C3A. Secondary: Sand #E8DCC4. Accent: Copper #B8733A. Text: Charcoal #222222. Background: White #FFFFFF.</p>
    <h2>Typography</h2><p>Headings: Georgia. Body: Arial.</p>
    <h2>Voice</h2><p>Calm, confident and warm. Do: speak about families and nature, use short sentences. Don't: use slang or pushy sales language.</p>
    <h2>Logo</h2><p>Keep clear space equal to the height of the F. Never stretch or recolour the logo.</p>
    <h2>Tagline</h2><p>Live close to nature.</p></body></html>`)
  const pdf = await maker.pdf({ format: 'A4' })
  await maker.close()

  await page.goto('/app/brandbook')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /I have a brandbook/ }).click()
  await (await chooser).setFiles({ name: 'brandbook.pdf', mimeType: 'application/pdf', buffer: pdf })
  const book = page.getByRole('article', { name: 'Brandbook' })
  await expect(book).toBeVisible({ timeout: 180_000 })
  await expect(book.getByText('#0F4C3A')).toBeVisible()
  await page.getByRole('button', { name: 'Apply to brand kit' }).click()
  await expect(page.getByText(/Applied — colours, fonts and voice/)).toBeVisible()
  expect(sql(`select colors[1] from "BrandKit" where "workspaceId"='${ws}'`)).toBe('#0F4C3A')
  expect(sql(`select fonts[1] from "BrandKit" where "workspaceId"='${ws}'`)).toBe('Georgia')
  expect(sql(`select voice from "BrandKit" where "workspaceId"='${ws}'`)).toMatch(/calm/i)
})

test('AI: create three directions and use one', async () => {
  test.skip(!AI, 'set QA_STRATEGY_AI=1 to run against the real model')
  test.setTimeout(240_000)
  await page.goto('/app/brandbook')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Start over' }).click()
  await page.getByRole('button', { name: /Create one with AI/ }).click()
  for (const t of ['Premium', 'Calm', 'Trustworthy']) await page.getByRole('group', { name: 'Personality' }).getByRole('button', { name: t }).click()
  await page.getByPlaceholder(/young families/).fill('Young families in Tbilisi buying their first apartment')
  await page.getByRole('button', { name: /Create three directions/ }).click()
  const dirs = page.getByRole('region', { name: 'Directions' })
  await expect(dirs).toBeVisible({ timeout: 180_000 })
  const use = dirs.getByRole('button', { name: /^Use “/ })
  await expect(use).toHaveCount(3)
  console.log('DIRECTIONS', await dirs.innerText())
  await use.nth(1).click()
  await expect(page.getByRole('article', { name: 'Brandbook' })).toBeVisible()
  expect(sql(`select source from "Brandbook" where "workspaceId"='${ws}'`)).toBe('GENERATED')
  expect(Number(sql(`select cardinality(colors) from "BrandKit" where "workspaceId"='${ws}'`))).toBeGreaterThanOrEqual(3)
})
