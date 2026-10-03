import { expect, test, type Page } from '@playwright/test'
import { createHash, randomBytes } from 'node:crypto'
import { startFakeMeta } from './fake-meta'
import { newAccount, sql } from './helpers'

// Weekly review: recommendations applied (post → Planner draft, goal →
// watched, manual → done) or dismissed, in the app and through the API.
// The review itself is AI-written: QA_STRATEGY_AI=1 runs it for real.

test.describe.configure({ mode: 'serial' })

const meta = startFakeMeta()
const AI = process.env.QA_STRATEGY_AI === '1'
let page: Page
let ws = ''

const facts = {
  week: { from: '2026-09-28', to: '2026-10-04', timeZone: 'Asia/Tbilisi' },
  nextWeek: { from: '2026-10-05', to: '2026-10-11', postsAlreadyPlanned: 0 },
  currency: 'GEL',
  ads: [
    {
      name: 'Lead Gen — Tbilisi',
      status: 'ACTIVE',
      objective: 'OUTCOME_LEADS',
      dailyBudget: 20,
      resultLabel: 'Leads',
      thisWeek: { spend: 140, results: 28, costPerResult: 5, ctr: 0.02, cpm: 7 },
      weekBefore: { spend: 140, results: 14, costPerResult: 10, ctr: 0.015 },
      ads: [],
    },
  ],
  organic: { thisWeek: { posts: 1, reach: 900, engagements: 40 }, weekBefore: { posts: 3, reach: 2400, engagements: 150 }, posts: [] },
  goals: [],
  alerts: [],
  activePlans: [],
}

function seedReview(workspaceId: string) {
  const id = `rev${Date.now()}${Math.floor(Math.random() * 1000)}`
  const data = { headline: 'Leads halved in price, posting slowed down', summary: 'Cost per lead fell from ₾10 to ₾5.', wins: [{ text: 'Cheaper leads', evidence: '₾5 vs ₾10' }], issues: [{ text: 'One post only', evidence: '1 vs 3' }] }
  sql(`insert into "WeeklyReview"(id,"workspaceId","weekStart","weekEnd",stats,data) values ('${id}','${workspaceId}','2026-09-28','2026-10-04','${JSON.stringify(facts).replace(/'/g, "''")}','${JSON.stringify(data).replace(/'/g, "''")}')`)
  const recs = [
    ['post', 'Post an evening reel on Thursday', 'high', { post: { date: '2026-10-08', time: '19:00', network: 'INSTAGRAM', format: 'Reel', caption: 'Sunset from the balcony', hashtags: ['arca'], visual: 'Balcony pan' } }],
    ['goal', 'Watch cost per lead', 'medium', { goal: { scope: 'ADS', network: null, metric: 'cost_per_result', target: 6, windowDays: 7 } }],
    ['budget', 'Raise the lead campaign to ₾30/day', 'high', { campaign: 'Lead Gen — Tbilisi', amountPerDay: 30, steps: ['Open Ads Manager', 'Set daily budget to ₾30'] }],
    ['other', 'Answer last week comments', 'low', { steps: ['Reply to the 4 open comments'] }],
  ] as const
  recs.forEach(([kind, title, impact, payload], i) =>
    sql(
      `insert into "Recommendation"(id,"workspaceId","reviewId",kind,title,why,impact,payload) values ('${id}r${i}','${workspaceId}','${id}','${kind}','${title}','Because the numbers say so','${impact}','${JSON.stringify(payload).replace(/'/g, "''")}')`,
    ),
  )
  return id
}

test.beforeAll(async ({ browser }) => {
  await meta.listen()
  page = await browser.newPage()
  await newAccount(page, 'weekly', 'Arca Development')
  await page.goto('/app/channels')
  await page.locator('a[href="/auth/meta"]').click()
  await page.waitForURL(/connected=3/)
  ws = sql(`select "workspaceId" from "SocialAccount" where network='META_ADS' order by "createdAt" desc limit 1`)
})
test.afterAll(async () => {
  await page.close()
  await meta.close()
})

test('empty state before the first review', async () => {
  await page.goto('/app/weekly')
  await expect(page.getByRole('heading', { name: 'Your first review arrives on Monday' })).toBeVisible()
})

test('review page: summary, numbers, recommendations by impact, badges', async () => {
  const id = seedReview(ws)
  await page.goto('/app/weekly')
  await expect(page.getByRole('heading', { name: 'Leads halved in price, posting slowed down' })).toBeVisible()
  await expect(page.getByText('· 4 open')).toBeVisible()
  const titles = await page.locator('li p.font-medium').allTextContents()
  expect(titles.slice(0, 2).sort()).toEqual(['Post an evening reel on Thursday', 'Raise the lead campaign to ₾30/day'])
  expect(titles.at(-1)).toBe('Answer last week comments')
  await expect(page.getByLabel('4 open recommendations')).toBeVisible()
  await page.goto('/app/dashboard')
  await expect(page.getByRole('link', { name: /4 recommendations from this week/ })).toBeVisible()
  expect(id).toBeTruthy()
})

test('apply a post, a goal and a manual step; dismiss one', async () => {
  await page.goto('/app/weekly')
  const card = (title: string) => page.locator('li.rounded-2xl', { hasText: title })

  await card('Post an evening reel on Thursday').getByRole('button', { name: 'Add to Planner' }).click()
  await expect(page.getByText('· 3 open')).toBeVisible()
  // 19:00 Tbilisi = 15:00 UTC, as a draft.
  expect(sql(`select status||' '||to_char("scheduledAt",'YYYY-MM-DD HH24:MI') from "Post" where "workspaceId"='${ws}' and content='Sunset from the balcony'`)).toBe('DRAFT 2026-10-08 15:00')

  await card('Watch cost per lead').getByRole('button', { name: 'Watch this goal' }).click()
  await expect(page.getByText('· 2 open')).toBeVisible()
  expect(sql(`select metric||':'||target||':'||"atMost" from "Goal" where "workspaceId"='${ws}'`)).toBe('cost_per_result:6:true')

  await card('Raise the lead campaign').getByRole('button', { name: 'Mark as done' }).click()
  await expect(page.getByText('· 1 open')).toBeVisible()
  await card('Answer last week comments').getByRole('button', { name: 'Dismiss recommendation' }).click()
  await expect(page.getByText('All handled for this week.')).toBeVisible()

  expect(sql(`select kind||':'||status||':'||(("appliedRef" is not null)::text) from "Recommendation" where "workspaceId"='${ws}' order by id`)).toBe(
    'post:APPLIED:true\ngoal:APPLIED:true\nbudget:APPLIED:false\nother:DISMISSED:false',
  )
  await expect(page.getByRole('link', { name: 'draft →' })).toBeVisible()
})

test('partner API: latest review, apply, dismiss, isolation', async ({ playwright }) => {
  const stamp = Date.now()
  const keys: string[] = []
  for (const n of [1, 2]) {
    const key = `khma_${randomBytes(30).toString('base64url')}`
    sql(`insert into "Partner"(id,name,slug,mode,"updatedAt") values ('wp${stamp}${n}','P${n}','wp-${stamp}-${n}','MULTI',now())`)
    sql(`insert into "ApiKey"(id,"partnerId",name,prefix,"keyHash") values ('wk${stamp}${n}','wp${stamp}${n}','k','${key.slice(0, 12)}','${createHash('sha256').update(key).digest('hex')}')`)
    keys.push(key)
  }
  sql(`insert into "Workspace"(id,name,"partnerId","externalId","updatedAt") values ('ww${stamp}','Partner WS','wp${stamp}1','ext-weekly',now())`)
  const reviewId = seedReview(`ww${stamp}`)
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:3100', extraHTTPHeaders: { authorization: `Bearer ${keys[0]}` } })
  const other = await playwright.request.newContext({ baseURL: 'http://localhost:3100', extraHTTPHeaders: { authorization: `Bearer ${keys[1]}` } })

  const latest = await (await api.get('/api/v1/workspaces/ext-weekly/reviews/latest')).json()
  expect(latest.review).toMatchObject({ id: reviewId, headline: 'Leads halved in price, posting slowed down' })
  expect(latest.review.recommendations).toHaveLength(4)
  const post = latest.review.recommendations.find((r: { kind: string }) => r.kind === 'post')
  const other1 = latest.review.recommendations.find((r: { kind: string }) => r.kind === 'other')

  const applied = await api.post(`/api/v1/workspaces/ext-weekly/recommendations/${post.id}/apply`)
  expect(applied.status()).toBe(200)
  expect((await applied.json()).recommendation).toMatchObject({ status: 'applied' })
  expect((await api.post(`/api/v1/workspaces/ext-weekly/recommendations/${post.id}/apply`)).status()).toBe(409)
  expect((await (await api.post(`/api/v1/workspaces/ext-weekly/recommendations/${other1.id}/dismiss`)).json()).recommendation.status).toBe('dismissed')

  expect((await other.get('/api/v1/workspaces/ext-weekly/reviews/latest')).status()).toBe(404)
  expect((await other.post(`/api/v1/workspaces/ext-weekly/recommendations/${post.id}/dismiss`)).status()).toBe(404)
  await api.dispose()
  await other.dispose()
})

test('AI: review the last 7 days for real', async () => {
  test.skip(!AI, 'set QA_STRATEGY_AI=1 to run against the real model')
  test.setTimeout(400_000)
  // Make last week look alive: two Loudpilot posts with insights.
  sql(`delete from "WeeklyReview" where "workspaceId"='${ws}'`)
  await page.goto('/app/weekly')
  await page.getByRole('button', { name: 'Review the last 7 days' }).click()
  await expect(page.getByText(/open$/).or(page.getByText('All handled for this week.'))).toBeVisible({ timeout: 240_000 })
  console.log('REVIEW', sql(`select data::text from "WeeklyReview" where "workspaceId"='${ws}' order by "createdAt" desc limit 1`))
  console.log('RECS', sql(`select kind||' | '||impact||' | '||title||' | '||payload::text from "Recommendation" where "workspaceId"='${ws}' and status='OPEN'`))
  expect(Number(sql(`select count(*) from "Alert" where "workspaceId"='${ws}' and kind='weekly_review'`))).toBe(1)
})
