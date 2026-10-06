import { expect, test, type Page } from '@playwright/test'
import { startFakeMeta } from './fake-meta'
import { newAccount, sql } from './helpers'

// Dossier (history import → stats → AI audit) and the strategist (plan →
// apply posts and goals). AI steps run only with QA_STRATEGY_AI=1 — they
// call the real model and spend credits.

test.describe.configure({ mode: 'serial' })

const meta = startFakeMeta()
const AI = process.env.QA_STRATEGY_AI === '1'
let page: Page
let ws = ''

test.beforeAll(async ({ browser }) => {
  await meta.listen()
  page = await browser.newPage()
  await newAccount(page, 'dossier', 'Arca Development')
})
test.afterAll(async () => {
  await page.close()
  await meta.close()
})

test('connecting reads 12 months of posts and the ads behind each campaign', async () => {
  await page.goto('/app/channels')
  await page.locator('a[href="/auth/meta"]').click()
  await page.waitForURL(/connected=3/)
  ws = sql(`select "workspaceId" from "SocialAccount" where network='META_ADS' order by "createdAt" desc limit 1`)
  await expect.poll(() => sql(`select count(*) from "SocialPost" where "workspaceId"='${ws}'`), { timeout: 30_000 }).toBe('36')
  await expect.poll(() => sql(`select count(*) from "AdItem" i join "AdCampaign" c on c.id=i."campaignId" where c."workspaceId"='${ws}'`), { timeout: 30_000 }).toBe('3')

  expect(sql(`select format||':'||count(*) from "SocialPost" where "workspaceId"='${ws}' group by format order by format`)).toBe(
    'CAROUSEL:10\nIMAGE:10\nREEL:4\nTEXT:6\nVIDEO:6',
  )
  // Instagram reach and saves came in through field expansion.
  expect(sql(`select metrics->>'reach'||'/'||(metrics->>'saves') from "SocialPost" where "externalId"='igm-h0' and "workspaceId"='${ws}'`)).toBe('3000/6')
  // Ads keep their creative text and 90-day results.
  expect(sql(`select title||':'||results from "AdItem" i join "AdCampaign" c on c.id=i."campaignId" where c."workspaceId"='${ws}' and i."externalId"='ad-1'`)).toBe(
    'A home near the park:90',
  )
  expect(sql(`select "historyAt" is not null from "SocialAccount" where "workspaceId"='${ws}' and network='INSTAGRAM'`)).toBe('t')
})

test('dossier page invites to build when there is no audit yet', async () => {
  await page.goto('/app/dossier')
  await expect(page.getByText('36 posts read')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Build the dossier' })).toBeVisible()
})

test('applying a plan: posts become Planner drafts at local time, goals start watching', async () => {
  const data = {
    headline: 'Fill the open house with reels and lead ads',
    diagnosis: ['Few posts lately'],
    strategy: 'Reels plus a lead campaign.',
    audiences: [{ id: 'a1', name: 'Young families', who: 'Parents 28–40', why: 'They asked most', targeting: { ages: '28-40', genders: 'all', locations: ['Tbilisi'], interests: ['Parenting'] }, message: 'Room to grow' }],
    budgetSplit: [{ label: 'Lead ads', share: 1, why: 'Cheapest leads' }],
    ads: [{ id: 'c1', name: 'Open house leads', objective: 'LEADS', audienceId: 'a1', share: 1, days: 14, creatives: [{ headline: 'Visit Saturday', primaryText: 'Tour the flats', cta: 'SIGN_UP', visual: 'Family reel' }], why: 'Video ads won', budget: 280, dailyBudget: 20, forecast: null }],
    pillars: [{ name: 'Homes', why: 'Works', share: 1 }],
    posts: [
      { id: 'p1', date: '2026-11-02', time: '19:00', network: 'INSTAGRAM', format: 'Reel', pillar: 'Homes', caption: 'Open house this Saturday', hashtags: ['arca', 'tbilisi'], visual: 'Walkthrough', why: 'Reels 2x' },
      { id: 'p2', date: '2026-11-04', time: '10:30', network: 'FACEBOOK', format: 'Carousel', pillar: 'Homes', caption: 'Floor plans', hashtags: ['arca'], visual: 'Plans', why: 'Carousels work' },
    ],
    goals: [
      { id: 'g1', scope: 'ADS', metric: 'cost_per_result', target: 5, windowDays: 7, why: 'Keep leads cheap' },
      { id: 'g2', scope: 'POSTS', network: 'INSTAGRAM', metric: 'avg_reach', target: 1500, windowDays: 30, why: 'Reels reach' },
    ],
    weekly: 'Check cost per lead',
    risks: ['Low budget'],
    timeZone: 'Asia/Tbilisi',
    forecastNote: 'Test plan.',
  }
  const id = `plan${Date.now()}`
  sql(
    `insert into "StrategyPlan"(id,"workspaceId",title,goal,objective,budget,currency,"startsOn","endsOn",data,"updatedAt") values ('${id}','${ws}','${data.headline}','Sell flats','LEADS',280,'GEL','2026-11-01','2026-11-30','${JSON.stringify(data).replace(/'/g, "''")}',now())`,
  )
  await page.goto(`/app/strategy/${id}`)
  await expect(page.getByRole('heading', { name: data.headline })).toBeVisible()
  await page.getByRole('button', { name: 'Add 2 posts to Planner' }).click()
  await expect(page.getByText('2 posts added to the Planner as drafts.')).toBeVisible()
  // 19:00 in Tbilisi = 15:00 UTC; drafts, never auto-published.
  expect(sql(`select status||' '||to_char("scheduledAt",'YYYY-MM-DD HH24:MI')||' '||array_to_string(channels,',') from "Post" where "workspaceId"='${ws}' and content='Open house this Saturday'`)).toBe(
    'DRAFT 2026-11-02 15:00 INSTAGRAM',
  )
  await expect(page.getByRole('button', { name: 'All in the Planner' })).toBeDisabled()

  await page.getByRole('button', { name: 'Watch 2 goals' }).click()
  await expect(page.getByText('2 goals are now being watched.')).toBeVisible()
  expect(sql(`select metric||':'||target from "Goal" where "workspaceId"='${ws}' order by metric`)).toBe('avg_reach:1500\ncost_per_result:5')
  expect(sql(`select status from "StrategyPlan" where id='${id}'`)).toBe('ACTIVE')

  // Ad setup can be copied and marked as launched.
  await expect(page.getByRole('button', { name: 'Copy setup' })).toBeVisible()
  await page.getByLabel('Launched in Ads Manager').check()
  await expect.poll(() => sql(`select data->'ads'->0->>'launched' from "StrategyPlan" where id='${id}'`)).toBe('true')
})

test('the media plan at a glance and one-click launch', async () => {
  const data = {
    headline: 'Black Friday flats',
    diagnosis: ['x'],
    strategy: 'Reels then leads.',
    audiences: [],
    budgetSplit: [],
    ads: [],
    pillars: [],
    posts: [
      { id: 'q1', date: '2026-11-20', time: '19:00', network: 'INSTAGRAM', format: 'Reel', pillar: 'Homes', caption: 'Black Friday tour', hashtags: [], visual: 'Walkthrough', why: 'w' },
      { id: 'q2', date: '2026-11-22', time: '19:00', network: 'INSTAGRAM', format: 'Photo', pillar: 'Homes', caption: 'Kitchen', hashtags: [], visual: 'Kitchen', why: 'w' },
      { id: 'q3', date: '2026-11-24', time: '10:00', network: 'FACEBOOK', format: 'Carousel', pillar: 'Homes', caption: 'Plans', hashtags: [], visual: 'Plans', why: 'w' },
    ],
    goals: [{ id: 'h1', scope: 'POSTS', metric: 'posts', target: 3, windowDays: 7, why: 'Consistency' }],
    weekly: 'w',
    risks: [],
    timeZone: 'Asia/Tbilisi',
    forecastNote: 'n',
  }
  const id = `plan${Date.now()}b`
  sql(
    `insert into "StrategyPlan"(id,"workspaceId",title,goal,objective,budget,currency,"startsOn","endsOn",data,"updatedAt") values ('${id}','${ws}','${data.headline}','Sell flats','LEADS',null,'GEL','2026-11-15','2026-11-30','${JSON.stringify(data).replace(/'/g, "''")}',now())`,
  )
  await page.goto(`/app/strategy/${id}`)
  const glance = page.getByRole('region', { name: 'Media plan' })
  await expect(glance.getByText('3 posts')).toBeVisible()
  await expect(glance.getByText('Instagram + Facebook')).toBeVisible()
  await expect(glance.getByText('Instagram · Reel × 1')).toBeVisible()
  // Black Friday (27 Nov 2026) falls in the plan.
  await expect(glance.getByText(/Black Friday \(11-27\)/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Make the video →' })).toHaveAttribute('href', /\/app\/studio\?tab=video&ai=Black%20Friday%20tour/)
  await page.getByRole('button', { name: 'Launch the plan' }).click()
  await expect(page.getByText('3 posts in the Planner, 1 goals watched.')).toBeVisible()
  await expect(page.getByText('Plan launched')).toBeVisible()
  expect(sql(`select count(*) from "Post" where "workspaceId"='${ws}' and content in ('Black Friday tour','Kitchen','Plans')`)).toBe('3')

  // Launched: planned vs actual appears.
  const cmp = page.getByRole('region', { name: 'Plan vs actual' })
  await expect(cmp).toBeVisible()
  const row = cmp.getByRole('row', { name: /^Posts published/ })
  await expect(row).toContainText('3')
  await expect(row).toContainText('0')
  await expect(row).toContainText('Behind')
})

test('a planned ad linked to its Meta campaign is compared with its results', async () => {
  const planId = sql(`select id from "StrategyPlan" where "workspaceId"='${ws}' and title like 'Fill the open house%' limit 1`)
  await page.goto(`/app/strategy/${planId}`)
  const link = page.getByLabel('Linked Meta campaign')
  await expect(link).toBeVisible()
  const first = await link.locator('option').nth(1).getAttribute('value')
  await link.selectOption(first!)
  await expect.poll(() => sql(`select data->'ads'->0->>'adCampaignId' from "StrategyPlan" where id='${planId}'`)).toBe(first)
  await page.reload()
  const cmp = page.getByRole('region', { name: 'Plan vs actual' })
  await expect(cmp.getByRole('row', { name: /Ads · Open house leads · spend/ })).toBeVisible()
})

test('another workspace cannot open the plan', async ({ browser }) => {
  const id = sql(`select id from "StrategyPlan" where "workspaceId"='${ws}' limit 1`)
  const other = await browser.newPage()
  await newAccount(other, 'dossier-other')
  expect((await other.goto(`/app/strategy/${id}`))?.status()).toBe(404)
  await other.close()
})

test('AI: audit and a full plan from the dossier', async () => {
  test.skip(!AI, 'set QA_STRATEGY_AI=1 to run against the real model')
  test.setTimeout(600_000)
  sql(`update "Account" set "creditBalance"=100 where id=(select "accountId" from "Workspace" where id='${ws}')`)
  await page.goto('/app/dossier')
  await page.getByRole('button', { name: 'Build the dossier' }).click()
  await expect(page.getByText('Works', { exact: true })).toBeVisible({ timeout: 240_000 })
  await expect(page.getByText('Patterns')).toBeVisible()
  console.log('AUDIT', sql(`select data::text from "BrandAudit" where "workspaceId"='${ws}' order by "createdAt" desc limit 1`))

  await page.goto('/app/strategy/new')
  await page.getByLabel('Goal').fill('Get more enquiries for our 2-bedroom apartments in November')
  await page.getByRole('button', { name: 'More leads' }).click()
  await page.getByLabel('Ad budget').fill('600')
  await page.getByRole('button', { name: /Build my plan/ }).click()
  await page.waitForURL(/\/app\/strategy\/(?!new)/, { timeout: 240_000 })
  await expect(page.getByText('Diagnosis and strategy')).toBeVisible()
  console.log('PLAN', sql(`select data::text from "StrategyPlan" where "workspaceId"='${ws}' order by "createdAt" desc limit 1`))
})
