import { expect, test, type Page } from '@playwright/test'
import { newAccount, sql } from './helpers'

// Real Gemini generations (cost money): 2 small social campaigns, 1 rewrite,
// 1 blog series of 2 outlines, 1 "Write article". Post-generation checks are
// mostly soft so a single run reports everything without re-generating.

test.use({ timezoneId: 'Asia/Tbilisi' }) // UTC+4, no DST; wizard sends tzOffset -240
// Opt-in so a plain `npx playwright test tests/e2e/campaign` does not spend AI credits again.
test.skip(!process.env.QA_CAMP_AI, 'set QA_CAMP_AI=1 to run the real-AI campaign tests')

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

const items = (page: Page) => page.locator('ol > li')
const credits = (page: Page) => page.getByRole('link', { name: /credits left/ }).first()
const cellLink = (page: Page, day: string, href: string) =>
  page.locator('div.group', { has: page.getByLabel(`New post on ${day}`) }).locator(`a[href="${href}"]`)
const campaignUrl = /\/app\/campaigns\/(?!new)[^/?]+$/

test('social campaign: create (Tbilisi time), DB rows, credits, planner, rewrite, delete', async ({ page }) => {
  test.setTimeout(420_000)
  const problems = watch(page)
  const { email } = await newAccount(page, 'qa-camp')
  const acc = accountOf(email)
  const ws = workspaceOf(email)
  const name = 'QA Camp Social'

  await page.goto('/app/campaigns/new?kind=social')
  await page.getByPlaceholder('Summer sale').fill(name)
  await page.locator('textarea').fill('Autumn opening of our small Tbilisi coffee roastery: free cupping sessions every Saturday in October for new visitors.')
  await page.locator('input[type=date]').fill('2026-10-12') // Monday
  await page.locator('input[type=time]').fill('09:30')
  await page.getByRole('button', { name: 'Fewer Duration (weeks)' }).click() // 2 → 1 week, 3 posts/week
  await page.getByTitle('Instagram').click() // off
  await page.getByTitle('LinkedIn').click() // on
  await page.getByRole('main').locator('button', { hasText: /^Bold$/ }).click()
  await expect(page.getByText(/3 posts · 3 credits · 50 left/)).toBeVisible()
  await page.getByRole('button', { name: 'Create campaign' }).click()
  await expect(page.getByRole('button', { name: /Planning… up to a minute/ })).toBeVisible()
  await page.waitForURL(campaignUrl, { timeout: 180_000 })
  const id = page.url().split('/').pop()!

  // Campaign + posts in DB.
  expect(sql(`select kind||'|'||name||'|'||"postsPerWeek"||'|'||tone||'|'||language||'|'||status||'|'||"workspaceId" from "Campaign" where id='${id}'`)).toBe(
    `SOCIAL|${name}|3|Bold|English|ACTIVE|${ws}`,
  )
  const rows = sql(
    `select id||'|'||kind||'|'||to_char("scheduledAt",'YYYY-MM-DD HH24:MI')||'|'||array_to_string(channels,',')||'|'||"aiGenerated"||'|'||(length(content)>50)||'|'||(title is not null) from "Post" where "campaignId"='${id}' order by "scheduledAt"`,
  ).split('\n')
  expect(rows).toHaveLength(3)
  const postIds = rows.map((r) => r.split('|')[0])
  expect.soft(rows.map((r) => r.split('|').slice(1).join('|'))).toEqual([
    'SOCIAL|2026-10-12 05:30|FACEBOOK,LINKEDIN|true|true|true', // 09:30 Tbilisi = 05:30 UTC
    'SOCIAL|2026-10-14 05:30|FACEBOOK,LINKEDIN|true|true|true',
    'SOCIAL|2026-10-16 05:30|FACEBOOK,LINKEDIN|true|true|true',
  ])
  expect.soft(sql(`select to_char("startsOn",'YYYY-MM-DD HH24:MI')||' '||to_char("endsOn",'YYYY-MM-DD HH24:MI') from "Campaign" where id='${id}'`)).toBe(
    '2026-10-12 05:30 2026-10-16 05:30',
  )
  expect.soft(sql(`select count(*) from "Post" where "workspaceId"='${ws}'`)).toBe('3')

  // Exactly 3 credits, one ledger entry.
  expect.soft(sql(`select "creditBalance" from "Account" where id='${acc}'`)).toBe('47')
  expect.soft(sql(`select amount||'|'||reason||'|'||note from "CreditEntry" where "accountId"='${acc}' and amount<0`)).toBe(`-3|AI_TEXT|Campaign: ${name}`)
  await expect.soft(credits(page)).toContainText('47')

  // Campaign page: date order, local times, angles.
  await expect(items(page)).toHaveCount(3)
  const texts = await items(page).allInnerTexts()
  expect.soft(texts[0]).toMatch(/Mon 12 Oct[\s\S]*09:30[\s\S]*#1/)
  expect.soft(texts[1]).toMatch(/Wed 14 Oct[\s\S]*09:30[\s\S]*#2/)
  expect.soft(texts[2]).toMatch(/Fri 16 Oct[\s\S]*09:30[\s\S]*#3/)
  await expect.soft(page.getByText(/Mon 12 Oct – Fri 16 Oct · 3 posts · Bold · English/)).toBeVisible()

  // Planner: each post on its local day.
  await page.goto('/app/planner?m=2026-10')
  for (const [i, day] of ['2026-10-12', '2026-10-14', '2026-10-16'].entries()) {
    await expect.soft(cellLink(page, day, `/app/posts/${postIds[i]}`)).toBeVisible()
  }

  // Rewrite post #2: new content, 1 credit, other posts untouched.
  const snap = (pid: string) => sql(`select md5(coalesce(title,'')||content) from "Post" where id='${pid}'`)
  const before = postIds.map(snap)
  const oldTitle = sql(`select coalesce(title,'') from "Post" where id='${postIds[1]}'`)
  await page.goto(`/app/campaigns/${id}`)
  await items(page).nth(1).getByRole('button', { name: /Rewrite/ }).click()
  await expect(page.locator('ol button:disabled').first()).toBeVisible()
  await expect(page.locator('ol button:disabled')).toHaveCount(0, { timeout: 150_000 })
  await expect(page.locator('p.bg-red-50')).toHaveCount(0)
  expect(snap(postIds[1])).not.toBe(before[1])
  expect.soft(sql(`select coalesce(title,'') from "Post" where id='${postIds[1]}'`)).not.toBe(oldTitle)
  expect.soft([snap(postIds[0]), snap(postIds[2])]).toEqual([before[0], before[2]])
  expect.soft(sql(`select to_char("scheduledAt",'YYYY-MM-DD HH24:MI') from "Post" where id='${postIds[1]}'`)).toBe('2026-10-14 05:30')
  expect.soft(sql(`select "creditBalance" from "Account" where id='${acc}'`)).toBe('46')
  expect.soft(sql(`select amount||'|'||reason||'|'||note from "CreditEntry" where "accountId"='${acc}' and amount<0 order by "createdAt"`)).toBe(
    `-3|AI_TEXT|Campaign: ${name}\n-1|AI_TEXT|Rewrite: ${name}`,
  )

  // Delete the campaign: campaign + posts gone, no refund, planner empty.
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.waitForURL(/\/app\/campaigns$/)
  await expect(page.getByText('No campaigns yet')).toBeVisible()
  expect(sql(`select count(*) from "Campaign" where id='${id}'`)).toBe('0')
  expect(sql(`select count(*) from "Post" where "workspaceId"='${ws}'`)).toBe('0')
  expect.soft(sql(`select "creditBalance" from "Account" where id='${acc}'`)).toBe('46')
  await page.goto('/app/planner?m=2026-10')
  await expect(page.locator(`a[href^="/app/posts/"]:not([href^="/app/posts/new"])`)).toHaveCount(0)

  expect(problems).toEqual([])
})

test('race: credits drop while the AI is generating → nothing saved, nothing charged, honest message', async ({ page }) => {
  test.setTimeout(300_000)
  const { email } = await newAccount(page, 'qa-camp')
  const acc = accountOf(email)
  const ws = workspaceOf(email)
  await page.goto('/app/campaigns/new?kind=social')
  await page.getByPlaceholder('Summer sale').fill('QA Camp Race')
  await page.locator('textarea').fill('Weekend brunch launch at our Tbilisi cafe, new seasonal menu every Sunday.')
  await page.getByRole('button', { name: 'Fewer Duration (weeks)' }).click()
  await page.getByRole('button', { name: 'Fewer Posts per week' }).click() // 1 week x 2 posts
  await expect(page.getByText(/2 posts · 2 credits · 50 left/)).toBeVisible()

  const sent = page.waitForRequest((r) => r.method() === 'POST' && !!r.headers()['next-action'])
  const t0 = Date.now()
  await page.getByRole('button', { name: 'Create campaign' }).click()
  await sent
  await page.waitForTimeout(1_000) // past requireContext + credit pre-check, inside the AI call
  sql(`update "Account" set "creditBalance"=1 where id='${acc}'`)
  const err = page.locator('p.bg-red-50')
  await expect(err).toBeVisible({ timeout: 180_000 })
  const elapsed = Date.now() - t0
  expect(elapsed, 'the error must come after the AI call, not from the pre-check').toBeGreaterThan(2_500)

  expect(sql(`select count(*) from "Campaign" where "workspaceId"='${ws}'`)).toBe('0')
  expect(sql(`select count(*) from "Post" where "workspaceId"='${ws}'`)).toBe('0')
  expect(sql(`select "creditBalance" from "Account" where id='${acc}'`)).toBe('1')
  expect(sql(`select count(*) from "CreditEntry" where "accountId"='${acc}' and amount<0`)).toBe('0')
  // Actual: "This needs 2 credits and you have 0." — the balance is 1 (actions.ts:91 passes a hard-coded 0).
  await expect(err).toHaveText('This needs 2 credits and you have 1. Choose a plan to get more.')
})

test('blog series: outlines charged 1 each, weekly schedule, Write article charges 3 and opens in blog editor', async ({ page }) => {
  test.setTimeout(480_000)
  const problems = watch(page)
  const { email } = await newAccount(page, 'qa-camp')
  const acc = accountOf(email)
  const ws = workspaceOf(email)
  const name = 'QA Camp Blog'

  await page.goto('/app/campaigns')
  await page.getByRole('link', { name: 'Blog series', exact: true }).click()
  await page.getByPlaceholder('Spring guides').fill(name)
  await page.locator('textarea').fill('Short practical guides for home baristas: choosing beans and grinding at home.')
  await page.locator('input[type=date]').fill('2026-10-12')
  await page.locator('input[type=time]').fill('10:00')
  await page.getByRole('button', { name: 'Fewer Articles', exact: true }).click()
  await page.getByRole('button', { name: 'Fewer Articles', exact: true }).click() // 4 → 2, 1 per week
  await expect(page.getByText(/2 article outlines · 2 credits · 50 left/)).toBeVisible()
  await page.getByRole('button', { name: 'Plan the series' }).click()
  await page.waitForURL(campaignUrl, { timeout: 180_000 })
  const id = page.url().split('/').pop()!

  expect(sql(`select kind||'|'||"postsPerWeek"||'|'||language from "Campaign" where id='${id}'`)).toBe('BLOG|1|English')
  const rows = sql(
    `select id||'|'||kind||'|'||to_char("scheduledAt",'YYYY-MM-DD HH24:MI')||'|'||(length(coalesce(outline,''))>20)||'|'||(content='')||'|'||(length(coalesce(title,''))>5) from "Post" where "campaignId"='${id}' order by "scheduledAt"`,
  ).split('\n')
  expect(rows).toHaveLength(2)
  const postIds = rows.map((r) => r.split('|')[0])
  expect.soft(rows.map((r) => r.split('|').slice(1).join('|'))).toEqual(['BLOG|2026-10-12 06:00|true|true|true', 'BLOG|2026-10-19 06:00|true|true|true'])
  expect.soft(sql(`select to_char("endsOn",'YYYY-MM-DD HH24:MI') from "Campaign" where id='${id}'`)).toBe('2026-10-19 06:00')
  expect.soft(sql(`select "creditBalance" from "Account" where id='${acc}'`)).toBe('48')
  expect.soft(sql(`select amount||'|'||reason||'|'||note from "CreditEntry" where "accountId"='${acc}' and amount<0`)).toBe(`-2|AI_BLOG|Blog series: ${name}`)

  await expect(page.getByText(/2 articles \(0 written\)/)).toBeVisible()
  const write = page.getByRole('button', { name: 'Write article · 3 credits' })
  await expect(write).toHaveCount(2)

  await page.goto('/app/planner?m=2026-10')
  await expect.soft(cellLink(page, '2026-10-12', `/app/blog/${postIds[0]}`)).toBeVisible()
  await expect.soft(cellLink(page, '2026-10-19', `/app/blog/${postIds[1]}`)).toBeVisible()

  // Write the first article.
  await page.goto(`/app/campaigns/${id}`)
  await write.first().click()
  await expect(page.getByRole('button', { name: 'Writing…' })).toBeVisible()
  await expect(write).toHaveCount(1, { timeout: 200_000 })
  await expect(page.locator('p.bg-red-50')).toHaveCount(0)
  await expect.soft(page.getByText(/2 articles \(1 written\)/)).toBeVisible()
  expect(Number(sql(`select length(content) from "Post" where id='${postIds[0]}'`))).toBeGreaterThan(500)
  expect.soft(sql(`select content from "Post" where id='${postIds[1]}'`)).toBe('')
  const title = sql(`select title from "Post" where id='${postIds[0]}'`)
  expect.soft(sql(`select "creditBalance" from "Account" where id='${acc}'`)).toBe('45')
  expect.soft(sql(`select amount||'|'||reason||'|'||note from "CreditEntry" where "accountId"='${acc}' and amount<0 order by "createdAt"`)).toBe(
    `-2|AI_BLOG|Blog series: ${name}\n-3|AI_BLOG|Article: ${title}`,
  )
  await expect.soft(credits(page)).toContainText('45')

  // Opens in the blog editor with the written body.
  await items(page).first().getByRole('link', { name: 'Edit' }).click()
  await page.waitForURL(`**/app/blog/${postIds[0]}`)
  await expect(page.getByPlaceholder('Article title')).toHaveValue(title)
  // Written articles open on the Preview tab.
  const words = Number(((await page.getByText(/^[\d,]+ words$/).textContent()) ?? '0').replace(/\D/g, ''))
  expect(words).toBeGreaterThan(150)
  await expect(page.locator('article')).toContainText(/\w{4,}/)
  await expect(page.getByRole('link', { name: `Part of ${name}` })).toBeVisible()

  expect(problems).toEqual([])
})
