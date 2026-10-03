import { expect, test, type APIRequestContext } from '@playwright/test'
import { createHash, randomBytes } from 'node:crypto'
import { startFakeMeta } from './fake-meta'
import { sql } from './helpers'

// The partner flow end to end: workspace → signup → connect link (customer
// connects Meta without a Loudpilot login) → channels, analytics, goals, alerts.

test.describe.configure({ mode: 'serial' })

const meta = startFakeMeta()
const stamp = Date.now()
const ext = `upla-company-${stamp}`

let n = 0
function partnerKey(mode: 'SINGLE' | 'MULTI') {
  const id = `ptn${stamp}${mode}${++n}`
  const key = `khma_${randomBytes(30).toString('base64url')}`
  const hash = createHash('sha256').update(key).digest('hex')
  sql(`insert into "Partner"(id,name,slug,mode,"updatedAt") values ('${id}','Test ${mode}','test-${mode.toLowerCase()}-${stamp}-${n}','${mode}',now())`)
  sql(`insert into "ApiKey"(id,"partnerId",name,prefix,"keyHash") values ('k${id}','${id}','test','${key.slice(0, 12)}','${hash}')`)
  return key
}

let api: APIRequestContext
let other: APIRequestContext
const KEY = partnerKey('MULTI')
const OTHER = partnerKey('MULTI')

test.beforeAll(async ({ playwright }) => {
  await meta.listen()
  api = await playwright.request.newContext({ baseURL: 'http://localhost:3100', extraHTTPHeaders: { authorization: `Bearer ${KEY}` } })
  other = await playwright.request.newContext({ baseURL: 'http://localhost:3100', extraHTTPHeaders: { authorization: `Bearer ${OTHER}` } })
})
test.afterAll(async () => {
  await api.dispose()
  await other.dispose()
  await meta.close()
})

test('create and register a workspace', async () => {
  const ws = await api.post('/api/v1/workspaces', { data: { externalId: ext, name: 'Arca Development' } })
  expect(ws.status()).toBe(200)
  const signup = await api.post(`/api/v1/workspaces/${ext}/signup`, {
    data: { name: 'Arca Development LLC', email: `arca-${stamp}@khma.test`, acceptTerms: true },
  })
  expect(signup.status()).toBe(201)
  expect((await signup.json()).workspace).toMatchObject({ externalId: ext, registered: true })
})

test('connect link: the customer connects Meta without a Loudpilot login', async ({ browser }) => {
  const bad = await api.post(`/api/v1/workspaces/${ext}/connect-links`, { data: { network: 'meta', returnUrl: 'http://evil.example/back' } })
  expect(bad.status()).toBe(400)

  const res = await api.post(`/api/v1/workspaces/${ext}/connect-links`, {
    data: { network: 'meta', returnUrl: 'http://localhost:3100/?from=upla' },
  })
  expect(res.status()).toBe(201)
  const { url } = await res.json()
  expect(url).toMatch(/\/connect\/meta\?token=/)

  // A fresh browser: no Loudpilot session at all.
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(url)
  await page.waitForURL(/loudpilot_status=/)
  expect(page.url()).toContain('from=upla&loudpilot_status=connected&loudpilot_accounts=3')
  await ctx.close()

  // A tampered link is refused.
  const tampered = await fetch(url.replace(/token=./, 'token=X'), { redirect: 'manual' })
  expect(tampered.status).toBe(410)
})

test('channels and analytics', async () => {
  const ch = await (await api.get(`/api/v1/workspaces/${ext}/channels`)).json()
  expect(ch.channels.map((c: { network: string }) => c.network).sort()).toEqual(['facebook', 'instagram', 'meta_ads'])
  expect(JSON.stringify(ch)).not.toContain('token')

  await expect
    .poll(async () => (await (await api.get(`/api/v1/workspaces/${ext}/analytics?days=30`)).json()).campaigns?.length, { timeout: 20_000 })
    .toBe(2)
  const a = await (await api.get(`/api/v1/workspaces/${ext}/analytics?days=30`)).json()
  expect(a).toMatchObject({ currency: 'GEL', resultLabel: 'Leads', current: { spend: 900, results: 120 }, previous: { results: 60 } })
  expect(a.daily).toHaveLength(30)
  expect((await api.get(`/api/v1/workspaces/${ext}/analytics?days=12`)).status()).toBe(400)
})

test('goals: create, list, validate, delete', async () => {
  const a = await (await api.get(`/api/v1/workspaces/${ext}/analytics?days=30`)).json()
  const lead = a.campaigns.find((c: { name: string }) => c.name.startsWith('Lead Gen'))
  const res = await api.post(`/api/v1/workspaces/${ext}/goals`, {
    data: { scope: 'campaign', campaignId: lead.id, metric: 'cost_per_result', target: 4, windowDays: 7 },
  })
  expect(res.status()).toBe(201)
  const { goal } = await res.json()
  expect(goal).toMatchObject({ scope: 'campaign', metric: 'cost_per_result', atMost: true, target: 4, status: 'off_track', actual: 5 })

  const er = await api.post(`/api/v1/workspaces/${ext}/goals`, { data: { scope: 'posts', network: 'instagram', metric: 'engagement_rate', target: 3 } })
  expect(er.status()).toBe(201)
  expect((await er.json()).goal).toMatchObject({ target: 3, atMost: false, windowDays: 7 })

  const wrong = await api.post(`/api/v1/workspaces/${ext}/goals`, { data: { scope: 'posts', metric: 'cost_per_result', target: 4 } })
  expect(wrong.status()).toBe(400)
  expect((await wrong.json()).error.message).toContain('does not apply')

  const list = await (await api.get(`/api/v1/workspaces/${ext}/goals`)).json()
  expect(list.goals).toHaveLength(2)
  expect((await api.delete(`/api/v1/workspaces/${ext}/goals/${goal.id}`)).status()).toBe(200)
  expect((await api.delete(`/api/v1/workspaces/${ext}/goals/${goal.id}`)).status()).toBe(404)
})

test('alerts: list and mark read', async () => {
  const ws = sql(`select id from "Workspace" where "externalId"='${ext}'`)
  sql(`insert into "Alert"(id,"workspaceId",kind,severity,title,body,href) values ('al${stamp}','${ws}','campaign_rejected','CRITICAL','Meta rejected Lead Gen','Fix the ad','/app/dashboard')`)
  const list = await (await api.get(`/api/v1/workspaces/${ext}/alerts?unread=true`)).json()
  expect(list.alerts[0]).toMatchObject({ id: `al${stamp}`, kind: 'campaign_rejected', severity: 'critical', read: false })
  expect(list.alerts[0].url).toMatch(/^http.*\/app\/dashboard$/)
  expect((await (await api.post(`/api/v1/workspaces/${ext}/alerts/read`, { data: {} })).json()).marked).toBeGreaterThanOrEqual(1)
  expect((await (await api.get(`/api/v1/workspaces/${ext}/alerts?unread=true`)).json()).alerts).toHaveLength(0)
})

test('another partner cannot reach the workspace', async () => {
  for (const path of ['', '/channels', '/analytics', '/goals', '/alerts']) {
    expect((await other.get(`/api/v1/workspaces/${ext}${path}`)).status()).toBe(404)
  }
  expect((await other.post(`/api/v1/workspaces/${ext}/connect-links`, { data: { network: 'meta', returnUrl: 'https://x.test/' } })).status()).toBe(404)
})
