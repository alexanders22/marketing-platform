import { expect, test, type Page } from '@playwright/test'
import { startFakeMeta } from './fake-meta'
import { newAccount, sql } from './helpers'

// Dashboard over the fake ad account (see fake-meta.ts: 2 campaigns, daily
// rows) — sync on connect, KPIs, deltas, campaign table and detail page.

test.describe.configure({ mode: 'serial' })

const meta = startFakeMeta()
let page: Page
let workspaceId = ''

test.beforeAll(async ({ browser }) => {
  await meta.listen()
  page = await browser.newPage()
  await newAccount(page, 'dash')
})
test.afterAll(async () => {
  await page.close()
  await meta.close()
})

test('empty dashboard points to Channels', async () => {
  await page.goto('/app/dashboard')
  await expect(page.getByRole('heading', { name: 'Connect your accounts to see results' })).toBeVisible()
  await page.getByRole('link', { name: 'Connect channels' }).click()
  await expect(page).toHaveURL(/\/app\/channels/)
})

test('connecting an ad account reads its campaigns and 12 months of results', async () => {
  await page.locator('a[href="/auth/meta"]').click()
  await page.waitForURL(/connected=3/)
  workspaceId = sql(`select "workspaceId" from "SocialAccount" where network='META_ADS' order by "createdAt" desc limit 1`)
  await expect.poll(() => sql(`select count(*) from "AdInsightDay" i join "AdCampaign" c on c.id=i."campaignId" where c."workspaceId"='${workspaceId}'`), { timeout: 20_000 }).toBe('730')
  expect(sql(`select name||':'||status||':'||coalesce("dailyBudget"::text,'-')||':'||currency from "AdCampaign" where "workspaceId"='${workspaceId}' order by name`)).toBe(
    'Lead Gen — Tbilisi:ACTIVE:20:GEL\nSpring Awareness:PAUSED:-:GEL',
  )
  // Both insight pages were read, in chunks of at most 90 days.
  const reads = meta.calls.filter((c) => c.path === '/act_1/insights')
  expect(reads.some((c) => c.params.after === 'p2')).toBe(true)
  for (const c of reads) {
    const { since, until } = JSON.parse(c.params.time_range)
    expect((Date.parse(until) - Date.parse(since)) / 86_400_000).toBeLessThan(90)
  }
})

test('30-day KPIs: leads only from lead campaigns, deltas vs previous 30 days', async () => {
  await page.goto('/app/dashboard?days=30')
  const kpi = (label: string) => page.locator('div.rounded-xl', { has: page.getByText(label, { exact: true }) }).first()
  await expect(kpi('Spend')).toContainText('₾900')
  await expect(kpi('Leads')).toContainText('120')
  await expect(kpi('Leads')).toContainText('100%') // 120 vs 60
  await expect(kpi('Cost per lead')).toContainText('₾5.00') // 600 / 120
  await expect(kpi('Cost per lead')).toContainText('50.0%') // was 10.00
  await expect(kpi('CTR')).toContainText('0.73%') // 2400 / 330000
  await expect(page.getByRole('img', { name: 'Daily spend and results' })).toBeVisible()
})

test('campaign table and detail page', async () => {
  const row = page.locator('tr', { hasText: 'Lead Gen — Tbilisi' })
  await expect(row).toContainText('Active')
  await expect(row).toContainText('₾20.00/day')
  await expect(row).toContainText('120 leads')
  await expect(page.locator('tr', { hasText: 'Spring Awareness' })).toContainText('Paused')
  await row.getByRole('link', { name: 'Lead Gen — Tbilisi' }).click()
  await expect(page.getByRole('heading', { name: 'Lead Gen — Tbilisi' })).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(30)
  await page.getByRole('navigation', { name: 'Period' }).getByRole('link', { name: '7 days' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(7)
  await expect(page.getByText('₾140.00')).toBeVisible()
})

test('period switch and sync now', async () => {
  await page.goto('/app/dashboard?days=7')
  await expect(page.locator('div.rounded-xl', { has: page.getByText('Spend', { exact: true }) }).first()).toContainText('₾210')
  const before = meta.calls.filter((c) => c.path === '/act_1/insights').length
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect.poll(() => meta.calls.filter((c) => c.path === '/act_1/insights').length).toBeGreaterThan(before)
  // Re-sync reads only the last few days.
  const last = meta.calls.filter((c) => c.path === '/act_1/insights').at(-1)!
  const { since, until } = JSON.parse(last.params.time_range)
  expect((Date.parse(until) - Date.parse(since)) / 86_400_000).toBe(3)
})

test('another workspace cannot open the campaign', async ({ browser }) => {
  const id = sql(`select id from "AdCampaign" where "workspaceId"='${workspaceId}' limit 1`)
  const other = await browser.newPage()
  await newAccount(other, 'dash-other')
  const res = await other.goto(`/app/dashboard/ads/${id}`)
  expect(res?.status()).toBe(404)
  await other.close()
})

test('summary without AI credits left explains why', async () => {
  sql(`update "Account" set "creditBalance"=0 where id=(select "accountId" from "Workspace" where id='${workspaceId}')`)
  await page.goto('/app/dashboard')
  await page.getByRole('button', { name: /Summarise last 30 days/ }).click()
  await expect(page.getByText('This needs 1 credit and you have 0')).toBeVisible()
})
