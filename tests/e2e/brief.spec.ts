import { expect, test, type Page } from '@playwright/test'
import { newAccount, sql } from './helpers'

// "Let Loudpilot suggest": audiences by location and product, questions for
// what it doesn't know (answers kept in the dossier), ideas that fill the
// composer, the campaign wizard or the post editor. The AI part is gated.

test.describe.configure({ mode: 'serial' })
const AI = process.env.QA_STRATEGY_AI === '1'
let page: Page
let ws = ''

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  const { email } = await newAccount(page, 'brief', 'Bloom Bakery')
  ws = sql(`select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}'`)
  sql(`update "BrandKit" set description='Family bakery: sourdough bread, croissants and custom cakes. Shop in Vake, Tbilisi; delivery across Tbilisi.' where "workspaceId"='${ws}'`)
})
test.afterAll(async () => page.close())

test('the assistant is offered where posts and campaigns start', async () => {
  for (const url of ['/app/create', '/app/campaigns/new?kind=social', '/app/posts/new']) {
    await page.goto(url)
    await expect(page.getByRole('button', { name: /Not sure what to (post|run)\?/ })).toBeVisible()
  }
  await page.getByRole('button', { name: /Not sure what to post\?/ }).click()
  await expect(page.getByLabel('What do you want to achieve')).toBeVisible()
  // Outside the composer the assistant has its own language.
  await expect(page.getByLabel('Suggestions language')).toHaveValue('English')
  await expect(page.getByRole('button', { name: /Suggest · 1 credit/ })).toBeVisible()
})

test('owner answers live in the dossier and can be forgotten', async () => {
  sql(`insert into "BrandFact"(id,"workspaceId",question,answer,"updatedAt") values ('bf${Date.now()}','${ws}','Where do you sell?','Shop in Vake, delivery across Tbilisi',now())`)
  await page.goto('/app/dossier')
  await expect(page.getByRole('heading', { name: 'What you told Loudpilot' })).toBeVisible()
  await expect(page.getByText('Shop in Vake, delivery across Tbilisi')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Forget this answer' }).click()
  await expect(page.getByText('Shop in Vake, delivery across Tbilisi')).toHaveCount(0)
  expect(sql(`select count(*) from "BrandFact" where "workspaceId"='${ws}'`)).toBe('0')
})

test('AI: audiences, questions and ideas; an idea fills the composer; answers are saved', async () => {
  test.skip(!AI, 'set QA_STRATEGY_AI=1 to run against the real model')
  test.setTimeout(300_000)
  await page.goto('/app/create')
  await page.getByRole('button', { name: /Not sure what to post\?/ }).click()
  await page.getByLabel('What do you want to achieve').fill('More cake orders for weekends')
  await page.getByRole('button', { name: /Suggest · 1 credit/ }).click()
  const box = page.getByRole('region', { name: 'Loudpilot suggestions' })
  await expect(box.getByText('WHO TO REACH', { exact: true })).toBeVisible({ timeout: 120_000 })
  console.log('ADVICE', await box.innerText())

  const answers = box.getByLabel(/^Answer: /)
  if ((await answers.count()) > 0) {
    await answers.first().fill('Mostly parents in Vake and Saburtalo ordering birthday cakes')
    await box.getByRole('button', { name: 'Just save' }).click()
    await expect(box.getByText(/Saved to the dossier/)).toBeVisible()
    expect(Number(sql(`select count(*) from "BrandFact" where "workspaceId"='${ws}'`))).toBe(1)
  }

  await box.getByRole('button', { name: 'Use this idea' }).first().click()
  const prompt = page.locator('textarea').first()
  await expect(prompt).not.toHaveValue('')
  console.log('PROMPT', await prompt.inputValue())
  expect(Number(sql(`select -sum(amount) from "CreditEntry" e join "Workspace" w on w."accountId"=e."accountId" where w.id='${ws}' and e.note='Marketing suggestions'`))).toBe(1)
})

test('AI: switching the language translates the suggestions, answers stay', async () => {
  test.skip(!AI, 'set QA_STRATEGY_AI=1 to run against the real model')
  test.setTimeout(300_000)
  await page.goto('/app/campaigns/new?kind=social')
  await page.getByRole('button', { name: /Not sure what to run\?/ }).click()
  await page.getByLabel('What do you want to achieve').fill('More cake orders for weekends')
  await page.getByRole('button', { name: /Suggest · 1 credit/ }).click()
  const box = page.getByRole('region', { name: 'Loudpilot suggestions' })
  await expect(box.getByText('WHO TO REACH', { exact: true })).toBeVisible({ timeout: 120_000 })
  const ideaEn = await box.locator('li p.text-sm.font-semibold').first().innerText()
  await box.getByLabel('Suggestions language').selectOption('Russian')
  await expect(box.getByText(/Translating to Russian/)).toBeVisible()
  await expect(box.getByText(/Translating to Russian/)).toHaveCount(0, { timeout: 90_000 })
  const ideaRu = await box.locator('li p.text-sm.font-semibold').first().innerText()
  console.log('IDEA', ideaEn, '→', ideaRu)
  expect(ideaRu).toMatch(/[А-Яа-яЁё]/)
  expect(ideaRu).not.toBe(ideaEn)
  // Still the same number of ideas, still usable.
  await expect(box.getByRole('button', { name: 'Use this idea' })).toHaveCount(3)
})
