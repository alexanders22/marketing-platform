import { expect, test, type Page } from '@playwright/test'
import { newAccount, sql } from './helpers'

// Social campaigns ask about pictures first: answer, then create.
async function submitCampaign(page: Page, pictures: 'No pictures' | 'AI-generated' | 'Choose photos' = 'No pictures') {
  await page.getByRole('main').getByRole('button', { name: 'Create campaign' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Pictures for your posts' })
  await dialog.getByRole('radio', { name: pictures }).click()
  await dialog.getByRole('button', { name: /^(Create campaign|Planning… up to a minute)$/ }).click()
}

// Campaign wizard checks that never reach the AI (validation, steppers, cost
// summary, credit gate). Every server call here returns before generation.

test.use({ timezoneId: 'Asia/Tbilisi' })

const accountOf = (email: string) =>
  sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${email}'`)
const workspaceOf = (email: string) =>
  sql(`select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}' order by w."createdAt" limit 1`)

function watch(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 300)}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`))
  page.on('response', (r) => r.status() >= 500 && problems.push(`${r.status()} ${r.url()}`))
  return problems
}

// Pills are matched by text: the wrapping <label> renames the first pill of each group (e.g. "Language English…").
const pill = (page: Page, text: string) => page.getByRole('main').locator('button', { hasText: new RegExp(`^${text}$`) })
const summary = (page: Page) => page.locator('span', { has: page.locator('svg.lucide-zap') }).last()

test('social wizard: required fields, steppers, cost summary, channels, tone, language', async ({ page }) => {
  const problems = watch(page)
  await newAccount(page, 'qa-camp')
  await page.goto('/app/campaigns')
  await expect(page.getByText('No campaigns yet')).toBeVisible()
  await page.getByRole('link', { name: 'Social campaign' }).click()
  await expect(page).toHaveURL(/\/app\/campaigns\/new\?kind=social/)
  await expect(page.getByRole('heading', { name: 'New AI social campaign' })).toBeVisible()

  const create = page.getByRole('button', { name: 'Create campaign' })
  const name = page.getByPlaceholder('Summer sale')
  const brief = page.locator('textarea')

  // Defaults: 2 weeks x 3 posts.
  await expect(summary(page)).toHaveText(/6 posts · 6 credits · 50 left/)
  await expect(create).toBeDisabled()
  await name.fill('   ')
  await brief.fill('A long enough campaign brief')
  await expect(create).toBeDisabled() // whitespace-only name
  await name.fill('QA name')
  await brief.fill('  short   ')
  await expect(create).toBeDisabled() // < 10 chars after trim
  await brief.fill('1234567890')
  await expect(create).toBeEnabled()

  // Steppers clamp at their bounds.
  const fewerWeeks = page.getByRole('button', { name: 'Fewer Duration (weeks)' })
  const moreWeeks = page.getByRole('button', { name: 'More Duration (weeks)' })
  const fewerPer = page.getByRole('button', { name: 'Fewer Posts per week' })
  const morePer = page.getByRole('button', { name: 'More Posts per week' })
  for (let i = 0; i < 4; i++) await fewerWeeks.click()
  for (let i = 0; i < 4; i++) await fewerPer.click()
  await expect(summary(page)).toHaveText(/^\s*1 posts? · 1 credit · 50 left/)
  for (let i = 0; i < 10; i++) await moreWeeks.click()
  for (let i = 0; i < 10; i++) await morePer.click()
  await expect(summary(page)).toHaveText(/56 posts · 56 credits · 50 left/)
  await fewerWeeks.click()
  await expect(summary(page)).toHaveText(/49 posts · 49 credits/)

  // Channels toggle, default Facebook + Instagram.
  await expect(page.getByTitle('Facebook')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTitle('Instagram')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTitle('LinkedIn').click()
  await expect(page.getByTitle('LinkedIn')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTitle('Instagram').click()
  await expect(page.getByTitle('Instagram')).toHaveAttribute('aria-pressed', 'false')

  // Tone / language pills are single-select.
  await pill(page, 'Bold').click()
  await expect(pill(page, 'Bold')).toHaveClass(/bg-zinc-900/)
  await expect(pill(page, 'Friendly')).not.toHaveClass(/bg-zinc-900/)
  await pill(page, 'Georgian').click()
  await expect(pill(page, 'Georgian')).toHaveClass(/bg-zinc-900/)
  await expect(pill(page, 'English')).not.toHaveClass(/bg-zinc-900/)

  expect(problems).toEqual([])
})

test('blog wizard: steppers 2..12 and 1..3, outline cost summary', async ({ page }) => {
  const problems = watch(page)
  await newAccount(page, 'qa-camp')
  await page.goto('/app/campaigns/new?kind=blog')
  await expect(page.getByRole('heading', { name: 'New AI blog campaign' })).toBeVisible()
  await expect(summary(page)).toHaveText(/4 article outlines · 4 credits · 50 left/)
  await expect(page.getByTitle('Facebook')).toHaveCount(0) // no channels for blog
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Fewer Articles', exact: true }).click()
  await expect(summary(page)).toHaveText(/2 article outlines · 2 credits/)
  for (let i = 0; i < 15; i++) await page.getByRole('button', { name: 'More Articles', exact: true }).click()
  await expect(summary(page)).toHaveText(/12 article outlines · 12 credits/)
  const perWeek = page.getByRole('button', { name: 'More Articles per week' }).locator('..').locator('span')
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'More Articles per week' }).click()
  await expect(perWeek).toHaveText('3')
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Fewer Articles per week' }).click()
  await expect(perWeek).toHaveText('1')
  await expect(page.getByRole('button', { name: 'Plan the series' })).toBeDisabled()
  expect(problems).toEqual([])
})

test('not enough credits: social + blog refused before AI, nothing created, nothing charged', async ({ page }) => {
  const problems = watch(page)
  const { email } = await newAccount(page, 'qa-camp')
  const acc = accountOf(email)
  const ws = workspaceOf(email)
  sql(`update "Account" set "creditBalance"=3 where id='${acc}'`)
  const entriesBefore = sql(`select count(*) from "CreditEntry" where "accountId"='${acc}'`)

  await page.goto('/app/campaigns/new?kind=social')
  await expect(summary(page)).toHaveText(/6 posts · 6 credits · 3 left/)
  await page.getByPlaceholder('Summer sale').fill('QA too expensive')
  await page.locator('textarea').fill('A campaign that costs more credits than we have.')
  const t0 = Date.now()
  await submitCampaign(page)
  await expect(page.getByText('This needs 6 credits and you have 3. Choose a plan to get more.')).toBeVisible()
  expect(Date.now() - t0).toBeLessThan(5_000) // refused before generation
  await expect(page).toHaveURL(/\/app\/campaigns\/new/)

  await page.goto('/app/campaigns/new?kind=blog')
  sql(`update "Account" set "creditBalance"=1 where id='${acc}'`)
  await page.reload()
  await page.getByPlaceholder('Spring guides').fill('QA blog too expensive')
  await page.locator('textarea').fill('A blog series that costs more than we have.')
  await page.getByRole('button', { name: 'Plan the series' }).click()
  await expect(page.getByText('This needs 4 credits and you have 1. Choose a plan to get more.')).toBeVisible()

  expect(sql(`select count(*) from "Campaign" where "workspaceId"='${ws}'`)).toBe('0')
  expect(sql(`select count(*) from "Post" where "workspaceId"='${ws}'`)).toBe('0')
  expect(sql(`select "creditBalance" from "Account" where id='${acc}'`)).toBe('1')
  expect(sql(`select count(*) from "CreditEntry" where "accountId"='${acc}'`)).toBe(entriesBefore)
  expect(problems).toEqual([])
})

test('server validation: empty start date and empty time give readable errors (no AI call)', async ({ page }) => {
  const { email } = await newAccount(page, 'qa-camp')
  const ws = workspaceOf(email)
  await page.goto('/app/campaigns/new?kind=social')
  await page.getByPlaceholder('Summer sale').fill('QA validation')
  await page.locator('textarea').fill('A brief that is long enough to pass.')
  await page.locator('input[type=date]').fill('')
  await submitCampaign(page)
  await expect(page.getByText('Pick a start date')).toBeVisible()

  await page.locator('input[type=date]').fill('2026-12-01')
  await page.locator('input[type=time]').fill('')
  await submitCampaign(page)
  const err = page.locator('p.bg-red-50')
  await expect(err).not.toHaveText('Pick a start date')
  await expect(err).toBeVisible()
  const text = (await err.textContent()) ?? ''
  expect(sql(`select count(*) from "Campaign" where "workspaceId"='${ws}'`)).toBe('0')
  // Expected a human message like "Pick a posting time", not zod's default.
  expect(text, `time error shown to user: "${text}"`).not.toMatch(/Invalid|pattern|regex/i)
})

test('start date in the past is rejected', async ({ page }) => {
  const { email } = await newAccount(page, 'qa-camp')
  const acc = accountOf(email)
  // Low balance so a request that passes validation stops at the credit gate (no AI call).
  sql(`update "Account" set "creditBalance"=1 where id='${acc}'`)
  await page.goto('/app/campaigns/new?kind=social')
  await page.getByPlaceholder('Summer sale').fill('QA past date')
  await page.locator('textarea').fill('A brief that is long enough to pass.')
  await page.locator('input[type=date]').fill('2024-01-01')
  await submitCampaign(page)
  const err = page.locator('p.bg-red-50')
  await expect(err).toBeVisible()
  // Actual: the server accepts the past date and only fails on credits.
  await expect(err).not.toHaveText(/credit/)
})

test('clicking a field label does not toggle the first channel / tone', async ({ page }) => {
  await newAccount(page, 'qa-camp')
  await page.goto('/app/campaigns/new?kind=social')
  const fb = page.getByTitle('Facebook')
  await expect(fb).toHaveAttribute('aria-pressed', 'true')
  // <Field> wraps the button group in a <label>; clicking the label text activates its first button.
  await page.getByRole('main').getByText('Channels', { exact: true }).click()
  await expect(fb).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('main').getByText('Tone', { exact: true }).click()
  await expect(pill(page, 'Friendly')).toHaveClass(/bg-zinc-900/)
})
