import { expect, request as pwRequest, test, type BrowserContext, type Page } from '@playwright/test'
import { newAccount, sql } from './helpers'

// Real Gemini calls (cost money). Runs only with CONTENT_AI=1.
// Budget: 2 text generations (one with 1 image) + 1 AI blog article.
test.skip(!process.env.CONTENT_AI, 'set CONTENT_AI=1 to run the paid AI generation tests')

const accountIdOf = (email: string) =>
  sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${email}' order by m.id limit 1`)
const workspaceIdOf = (email: string) =>
  sql(`select w.id from "Workspace" w where w."accountId"='${accountIdOf(email)}' order by w."createdAt" limit 1`)
const balance = (acct: string) => Number(sql(`select "creditBalance" from "Account" where id='${acct}'`))
const mark = () => sql(`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US')`)
// Spend entries booked after `since`.
const spendSince = (acct: string, since: string) =>
  sql(`select coalesce(string_agg(reason || ':' || amount, ',' order by reason::text), '') from "CreditEntry" where "accountId"='${acct}' and amount < 0 and "createdAt" > '${since}'`)

let ctx: BrowserContext
let page: Page
let email: string
const problems: string[] = []

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  page = await ctx.newPage()
  ;({ email } = await newAccount(page, 'qa-content-ai'))
  page.on('console', (m) => m.type() === 'error' && problems.push(`console(${page.url()}): ${m.text().slice(0, 300)}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('response', (r) => r.status() >= 500 && problems.push(`${r.status()} ${r.url()}`))
})
test.afterAll(async () => ctx?.close())
test.afterEach(() => {
  expect.soft(problems).toEqual([])
  problems.length = 0
})

const chip = (re: RegExp) => page.locator('main span.cursor-pointer').filter({ hasText: re })
const pop = () => page.locator('div.absolute.z-40')

test('AI post (text only): caption + AI/library hashtags merged, exactly 1 credit, Save draft opens editor', async () => {
  const acct = accountIdOf(email)
  const ws = workspaceIdOf(email)
  const bal0 = balance(acct)
  const t0 = mark()
  sql(`insert into "HashtagLibrary"(id,"workspaceId",name,tags,"updatedAt") values ('qalib${Date.now().toString(36)}','${ws}','QA lib',ARRAY['QaLibTag','CoffeeLovers','coffee'],now())`)
  await page.goto('/app/create')
  await chip(/^Hashtags/).click()
  await pop().getByRole('button', { name: /QA lib/ }).click()
  await expect(chip(/^Hashtags/)).toHaveText('Hashtags (1)')
  await page.keyboard.press('Escape')
  await chip(/^Medium$/).click()
  await pop().getByRole('button', { name: /^Short/ }).click()
  await page.locator('main textarea').fill('A short tip for coffee lovers: how to store coffee beans so they stay fresh. Mention #coffee.')
  await expect(page.locator('main span[title*="credit"]')).toHaveText('1')
  await page.getByRole('button', { name: 'Generate' }).click()
  await expect(page.getByText(/Writing your post/)).toBeVisible()
  const result = page.locator('div.border-emerald-200')
  await expect(result.getByText(/Your post · 1 credit used/)).toBeVisible({ timeout: 90_000 })

  const caption = (await result.locator('p.whitespace-pre-wrap').textContent())!.trim()
  const tagLine = (await result.locator('p.text-sky-700').textContent())!.trim()
  console.log('AI caption:', caption, '\nAI hashtags:', tagLine)
  expect.soft(caption.length).toBeGreaterThan(10)
  const tags = tagLine.split(/\s+/).map((t) => t.replace(/^#/, ''))
  expect.soft(tags.length).toBeGreaterThanOrEqual(3) // AI 3–6 + library
  const lower = tags.map((t) => t.toLowerCase())
  expect.soft(new Set(lower).size, 'no case-insensitive duplicates').toBe(lower.length)
  expect.soft(lower).toContain('qalibtag')
  expect.soft(lower).toContain('coffeelovers')
  expect.soft(lower).toContain('coffee')
  expect.soft(caption).not.toMatch(/#\w/) // hashtags not inside caption

  expect.soft(balance(acct)).toBe(bal0 - 1)
  expect.soft(spendSince(acct, t0)).toBe('AI_TEXT:-1')
  await expect.soft(page.getByText(`${bal0 - 1} credits left`)).toBeVisible()
  await expect.soft(page.locator('aside').getByText(String(bal0 - 1), { exact: true })).toBeVisible()

  await result.getByRole('button', { name: 'Save draft' }).click()
  // AI hashtags are not sanitised server-side; savePost may reject them.
  const err = page.locator('main p.bg-red-50')
  await Promise.race([page.waitForURL(/\/app\/posts\/c[a-z0-9]+$/, { timeout: 15_000 }), err.waitFor({ timeout: 15_000 })])
  expect(await err.count(), `Save draft error: ${(await err.count()) ? await err.textContent() : ''}`).toBe(0)
  await expect(page).toHaveURL(/\/app\/posts\/c[a-z0-9]+$/)
  const id = page.url().split('/').pop()!
  expect(sql(`select "aiGenerated" || '|' || ("scheduledAt" is null) || '|' || array_to_string(hashtags,' ') from "Post" where id='${id}'`)).toBe(
    `true|true|${tags.join(' ')}`,
  )
  expect(sql(`select content from "Post" where id='${id}'`)).toBe(caption)
  await expect(page.getByRole('heading', { name: 'Edit post' })).toBeVisible()
  await expect(page.locator('main span.bg-sky-50').filter({ hasText: 'AI' })).toBeVisible()
})

test('AI post with 1 image: 2 credits, image private to owner, Add to planner', async ({ baseURL }) => {
  const acct = accountIdOf(email)
  const bal0 = balance(acct)
  const t0 = mark()
  await page.goto('/app/create')
  await chip(/^Images/).click()
  await pop().getByRole('button', { name: /^1 image/ }).click()
  await expect(page.locator('main span[title*="credit"]')).toHaveText('2')
  await chip(/^Hashtags/).click()
  await pop().getByRole('button', { name: /AI hashtags/ }).click() // AI hashtags off
  await page.keyboard.press('Escape')
  await page.locator('main textarea').fill('Autumn special: a cosy cup of cinnamon latte at our cafe.')
  await page.getByRole('button', { name: 'Generate' }).click()
  await expect(page.getByText(/and generating 1 image/)).toBeVisible()
  const result = page.locator('div.border-emerald-200')
  await expect(result.getByText(/Your post · \d credits? used/)).toBeVisible({ timeout: 180_000 })
  const usedText = await result.getByText(/Your post ·/).textContent()
  console.log('image run:', usedText)
  expect.soft(usedText).toContain('2 credits used')
  await expect.soft(result.locator('p.text-sky-700')).toHaveCount(0) // AI hashtags off, no library selected
  expect.soft(balance(acct)).toBe(bal0 - 2)
  expect.soft(spendSince(acct, t0)).toBe('AI_IMAGE:-1,AI_TEXT:-1')

  const src = await result.locator('img').first().getAttribute('src')
  expect(src).toMatch(/^\/media\/c[a-z0-9]+$/)
  const own = await page.request.get(src!)
  expect(own.status()).toBe(200)
  expect(own.headers()['content-type']).toMatch(/^image\//)
  const anon = await pwRequest.newContext({ baseURL })
  expect((await anon.get(src!)).status()).toBe(404)
  await anon.dispose()
  await expect.poll(() => result.locator('img').first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100)

  await result.locator('span.cursor-pointer', { hasText: 'Add to planner' }).click()
  const planBtn = pop().getByRole('button', { name: 'Add to planner' })
  await expect(planBtn).toBeDisabled()
  await pop().locator('input[type=datetime-local]').fill('2026-10-25T11:00')
  await planBtn.click()
  await expect(page).toHaveURL(/\/app\/posts\/c[a-z0-9]+$/, { timeout: 15_000 })
  const id = page.url().split('/').pop()!
  const mediaId = src!.split('/').pop()
  expect(sql(`select array_to_string("mediaIds",',') || '|' || ("scheduledAt" is not null) from "Post" where id='${id}'`)).toBe(`${mediaId}|true`)
  await expect(page.locator('input[type=datetime-local]')).toHaveValue('2026-10-25T11:00')
  await page.goto('/app/planner?m=2026-10')
  await expect(
    page.locator('div.group').filter({ has: page.getByLabel('New post on 2026-10-25', { exact: true }) }).getByRole('link', { name: /11:00/ }),
  ).toBeVisible()
})

test('AI blog article: one call, exactly 3 credits, opens editor with markdown, Copy Markdown', async () => {
  const acct = accountIdOf(email)
  const bal0 = balance(acct)
  const t0 = mark()
  await page.goto('/app/blog/ai')
  await expect(page.getByText(`3 credits · ${bal0} left`)).toBeVisible()
  await page.locator('main textarea').fill('How to store coffee beans at home so they stay fresh')
  await page.getByPlaceholder(/tbilisi apartments/).fill('coffee storage, fresh beans')
  await page.getByRole('button', { name: /^Short/ }).click()
  await page.getByRole('button', { name: 'Write article' }).click()
  await expect(page.getByRole('button', { name: /Writing… up to a minute/ })).toBeVisible()
  await expect(page).toHaveURL(/\/app\/blog\/c[a-z0-9]+$/, { timeout: 170_000 })
  const id = page.url().split('/').pop()!
  expect.soft(balance(acct)).toBe(bal0 - 3)
  expect.soft(spendSince(acct, t0)).toBe('AI_BLOG:-3')
  const row = sql(`select kind || '|' || "aiGenerated" || '|' || array_to_string(hashtags, ',') from "Post" where id='${id}'`)
  console.log('AI blog row:', row)
  expect(row.startsWith('BLOG|true|')).toBe(true)
  await expect(page.getByRole('heading', { name: 'Edit article' })).toBeVisible()
  await expect(page.locator('article h2').first()).toBeVisible() // preview tab, H2 sections
  const title = await page.getByPlaceholder('Article title').inputValue()
  expect(title.length).toBeGreaterThan(5)
  await page.getByRole('button', { name: 'Copy Markdown' }).click()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip.startsWith(`# ${title}\n\n`)).toBe(true)
  expect(clip).toContain('## ')
  // Keywords shown in the editor as typed.
  await expect.soft(page.getByPlaceholder('seo, keywords, comma separated')).toHaveValue('coffee storage, fresh beans')
})
