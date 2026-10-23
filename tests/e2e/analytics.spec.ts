import { expect, test, type Page } from '@playwright/test'
import { startFakeMeta } from './fake-meta'
import { newAccount, sql } from './helpers'

// Analytics → Overview: one funnel from the first view of an ad or post to the sale —
// Meta ads and posts (fake Meta), then the website through the Loudpilot
// Tag — with cost per lead, per customer and the return on ad spend.

test.describe.configure({ mode: 'serial' })

const meta = startFakeMeta()
let page: Page
let ws = ''

const step = (key: string) => page.getByTestId(`step-${key}`)
// The exact number (big ones show as 12.3K).
const num = async (key: string) => Number((await step(key).getAttribute('title'))!.replace(/[^\d]/g, ''))

test.beforeAll(async ({ browser }) => {
  await meta.listen()
  page = await browser.newPage()
  const a = await newAccount(page, 'results', `Results ${Date.now()}`)
  ws = sql(`select id from "Workspace" where name='${a.brand}'`)
})
test.afterAll(async () => {
  await page.close()
  await meta.close()
})

test('nothing connected: every step says how to start measuring it', async () => {
  await page.goto('/app/dashboard')
  await page.getByRole('link', { name: 'Detailed analytics' }).click()
  await expect(page).toHaveURL(/\/app\/analytics\?days=30$/)
  await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible()
  // Analytics is the section; Overview its first tab.
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Analytics' })).toHaveAttribute('aria-current', 'page')
  // Old links still work.
  await page.goto('/app/results?days=7')
  await expect(page).toHaveURL(/\/app\/analytics\?days=7$/)
  const funnel = page.getByRole('list', { name: 'From view to sale' })
  await expect(funnel.getByRole('listitem')).toHaveCount(5)
  await expect(funnel.getByRole('listitem', { name: 'Saw your ads and posts' })).toContainText('Connect Meta Ads or your pages')
  await expect(funnel.getByRole('listitem', { name: 'Bought' })).toContainText('Install the Loudpilot Tag')
  await expect(page.getByRole('link', { name: 'Install the Loudpilot Tag' }).last()).toHaveAttribute('href', '/app/website/tag')
})

test('with Meta ads: views and clicks, spend, the campaigns', async () => {
  await page.goto('/app/channels')
  await page.locator('a[href="/auth/meta"]').click()
  await page.waitForURL(/connected=3/)
  await expect.poll(() => sql(`select count(*) from "AdInsightDay" i join "AdCampaign" c on c.id=i."campaignId" where c."workspaceId"='${ws}'`), { timeout: 20_000 }).toBe('730')
  await page.goto('/app/analytics')
  const seen = await num('seen')
  const clicked = await num('clicked')
  expect(seen).toBeGreaterThan(0)
  expect(clicked).toBeGreaterThan(0)
  expect(clicked).toBeLessThan(seen)
  await expect(page.getByRole('listitem', { name: 'Clicked' })).toContainText('of the step before')
  await expect(page.getByRole('table', { name: 'Ad campaigns' })).toContainText('Lead Gen — Tbilisi')
  // No website numbers yet.
  await expect(page.getByRole('listitem', { name: 'Visited the website' })).toContainText('Install the Loudpilot Tag')
  await expect(page.getByRole('button', { name: 'What is this? Ad spend' })).toBeVisible()
})

test('with the Loudpilot Tag: visits, leads and a sale by source; cost per lead and return on ad spend', async () => {
  // The site, three visits (an ad, Google, direct), two leads and a sale.
  await page.goto('/app/website/tag')
  const site = sql(`select id from "Site" where "workspaceId"='${ws}'`)
  const t = Date.now()
  sql(`insert into "Visitor"(id, "siteId", "cookieId") values ('rv1${t}', '${site}', 'c1${t}'), ('rv2${t}', '${site}', 'c2${t}'), ('rv3${t}', '${site}', 'c3${t}')`)
  sql(`insert into "Visit"(id, "siteId", "visitorId", sid, "landingUrl", source, medium, campaign, "startedAt") values ('rs1${t}', '${site}', 'rv1${t}', 's1${t}', 'https://bloom.ge/', 'facebook', 'paid', 'cmp-leads', now() - interval '2 days'), ('rs2${t}', '${site}', 'rv2${t}', 's2${t}', 'https://bloom.ge/', 'google', 'organic', null, now() - interval '1 day'), ('rs3${t}', '${site}', 'rv3${t}', 's3${t}', 'https://bloom.ge/', null, null, null, now() - interval '3 hours')`)
  sql(`insert into "TagEvent"(id, "siteId", "visitId", "visitorId", name, "eventId", value, currency, "createdAt") values ('re1${t}', '${site}', 'rs1${t}', 'rv1${t}', 'Lead', 'e1${t}', null, null, now() - interval '2 days'), ('re2${t}', '${site}', 'rs2${t}', 'rv2${t}', 'Lead', 'e2${t}', null, null, now() - interval '1 day'), ('re3${t}', '${site}', 'rs1${t}', 'rv1${t}', 'Purchase', 'e3${t}', 150, 'GEL', now() - interval '1 day')`)
  // One more visit the week before: the period before had 1 visit.
  sql(`insert into "Visitor"(id, "siteId", "cookieId") values ('rv4${t}', '${site}', 'c4${t}')`)
  sql(`insert into "Visit"(id, "siteId", "visitorId", sid, "landingUrl", source, medium, "startedAt") values ('rs4${t}', '${site}', 'rv4${t}', 's4${t}', 'https://bloom.ge/', 'google', 'organic', now() - interval '10 days')`)
  sql(`update "Site" set "lastEventAt"=now() where id='${site}'`)

  await page.goto('/app/analytics?days=7')
  await expect(step('visited')).toHaveText('3')
  await expect(step('leads')).toHaveText('2')
  await expect(step('customers')).toHaveText('1')
  await expect(page.getByRole('listitem', { name: 'Visited the website' })).toContainText('1 from ads')
  // 3 visits against 1 the week before.
  await expect(page.getByRole('listitem', { name: 'Visited the website' }).getByTitle('vs previous period')).toHaveText('200%')
  await expect(page.getByRole('listitem', { name: 'Bought' })).toContainText('150 GEL in sales')
  await expect(page.getByRole('listitem', { name: 'Became leads' })).toContainText('67% of the step before')

  // Money: the week's ad spend (GEL) over 2 leads, over 1 customer; 150 back.
  const spend = Number(sql(`select coalesce(sum(i.spend),0) from "AdInsightDay" i join "AdCampaign" c on c.id=i."campaignId" where c."workspaceId"='${ws}' and i.date > to_char(now() - interval '7 days', 'YYYY-MM-DD')`))
  expect(spend).toBeGreaterThan(0)
  const money = page.getByRole('heading', { name: 'What it cost and what came back' }).locator('..')
  await expect(money).toContainText(`${(150 / spend).toFixed(1)}×`)
  await expect(money).toContainText('₾150 in sales')

  // Where customers come from: the ad visit is matched to its campaign and its spend.
  const sources = page.getByRole('table', { name: 'Sources' })
  await expect(sources.getByRole('row', { name: /Lead Gen — Tbilisi/ })).toContainText('1')
  await expect(sources).toContainText('google / organic')
  await expect(sources).toContainText('Direct')
  await expect(page.getByRole('link', { name: 'Full report' })).toHaveAttribute('href', '/app/website/tag?d=7')
})

test('another workspace never sees these numbers', async ({ browser }) => {
  const other = await browser.newPage()
  await newAccount(other, 'results-other')
  await other.goto('/app/analytics')
  await expect(other.getByRole('listitem', { name: 'Visited the website' })).toContainText('Install the Loudpilot Tag')
  await expect(other.getByRole('listitem', { name: 'Saw your ads and posts' })).toContainText('Connect')
  await other.close()
})
