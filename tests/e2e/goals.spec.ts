import { expect, test, type Page } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { startFakeMeta, FAKE_META_PORT } from './fake-meta'
import { latestMail, newAccount, sql } from './helpers'

// Goals → hourly check → alerts (in app, email, partner webhook), plus the
// system alerts: rejected campaign, disconnected account, failed post.

test.describe.configure({ mode: 'serial' })

const meta = startFakeMeta()
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
)
const cron = createHmac('sha256', `cron:${env.KHMA_ENCRYPTION_KEY}`).update('tick').digest('hex')
const tick = (page: Page) => page.request.post('/api/cron/tick?goals=1', { headers: { 'x-khma-cron': cron } }).then((r) => r.json())

let page: Page
let email = ''
let ws = ''
let campaignId = ''
const alerts = () => sql(`select kind||':'||severity from "Alert" where "workspaceId"='${ws}' order by "createdAt"`)

test.beforeAll(async ({ browser }) => {
  await meta.listen()
  page = await browser.newPage()
  ;({ email } = await newAccount(page, 'goals'))
  await page.goto('/app/channels')
  await page.locator('a[href="/auth/meta"]').click()
  await page.waitForURL(/connected=3/)
  ws = sql(`select "workspaceId" from "SocialAccount" where network='META_ADS' order by "createdAt" desc limit 1`)
  await expect.poll(() => sql(`select count(*) from "AdCampaign" where "workspaceId"='${ws}'`), { timeout: 20_000 }).toBe('2')
  campaignId = sql(`select id from "AdCampaign" where "workspaceId"='${ws}' and name like 'Lead Gen%'`)
})
test.afterAll(async () => {
  await page.close()
  await meta.close()
})

test('create a cost-per-lead goal: first check is silent', async () => {
  await page.goto('/app/goals')
  await page.getByRole('button', { name: 'New goal' }).click()
  await page.getByLabel('Target').fill('4')
  await page.getByRole('button', { name: 'Create goal' }).click()
  const row = page.locator('li', { hasText: 'Cost per result — Lead Gen — Tbilisi' })
  await expect(row).toContainText('Off track') // ₾5 vs at most ₾4
  await expect(row).toContainText('₾5.00')
  expect(alerts()).toBe('')
})

test('recovery and slipping again raise alerts, emailed once', async () => {
  // Better week: 10 leads a day → ₾2 per lead.
  sql(`update "AdInsightDay" set results=10 where "campaignId"='${campaignId}'`)
  await tick(page)
  expect(alerts()).toBe('goal_recovered:INFO')
  // No leads at all while spending → off track.
  sql(`update "AdInsightDay" set results=0 where "campaignId"='${campaignId}'`)
  await tick(page)
  expect(alerts()).toBe('goal_recovered:INFO\ngoal_off_track:CRITICAL')
  const body = sql(`select body from "Alert" where "workspaceId"='${ws}' and kind='goal_off_track'`)
  expect(body).toContain('No results while ₾4.00 or more was spent')
  expect(body).toContain('check tracking and the form')
  // Same status again: no duplicate.
  await tick(page)
  expect(alerts().split('\n')).toHaveLength(2)
  const mail = await latestMail(email, 'Cost per result above target')
  expect(mail.Text).toContain('/app/dashboard/ads/')
})

test('post goals: average Instagram reach and engagement rate', async () => {
  // Two Instagram posts published 2 days ago with insights.
  const ig = sql(`select id from "SocialAccount" where "workspaceId"='${ws}' and network='INSTAGRAM'`)
  for (const [i, reach, eng] of [
    [1, 400, 20],
    [2, 600, 40],
  ] as const) {
    const pid = `goalpost${Date.now()}${i}`
    sql(`insert into "Post"(id,"workspaceId",kind,status,content,channels,"updatedAt") values ('${pid}','${ws}','SOCIAL','PUBLISHED','Post ${i}','{INSTAGRAM}',now())`)
    sql(
      `insert into "PostDelivery"(id,"postId","socialAccountId",status,"externalId",metrics,"createdAt") values ('d${pid}','${pid}','${ig}','PUBLISHED','ig-${pid}','{"reach":${reach},"interactions":${eng},"likes":${eng}}', now() - interval '2 days')`,
    )
  }
  await page.goto('/app/goals')
  for (const [metric, target] of [
    ['Average reach per post', '1000'],
    ['Engagement rate', '5'],
  ]) {
    await page.getByRole('button', { name: 'New goal' }).click()
    await page.getByRole('button', { name: /^Posts/ }).click()
    await page.getByLabel('Network').selectOption('INSTAGRAM')
    await page.getByLabel('Metric').selectOption({ label: metric })
    await page.getByLabel('Target').fill(target)
    await page.getByRole('button', { name: 'Create goal' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  const reachRow = page.locator('li', { hasText: 'Average reach per post — Instagram posts' })
  await expect(reachRow).toContainText('500') // (400 + 600) / 2
  await expect(reachRow).toContainText('Off track')
  const erRow = page.locator('li', { hasText: 'Engagement rate — Instagram posts' })
  await expect(erRow).toContainText('6.00%') // 60 / 1000
  await expect(erRow).toContainText('On track')

  // Reach grows → back on track.
  sql(`update "PostDelivery" set metrics='{"reach":1200,"interactions":30,"likes":30}' where id like 'dgoalpost%' and "socialAccountId" in (select id from "SocialAccount" where "workspaceId"='${ws}')`)
  await tick(page)
  expect(sql(`select count(*) from "Alert" where "workspaceId"='${ws}' and title like 'Average reach per post back on target%'`)).toBe('1')
})

test('rejected campaign and lost access raise system alerts', async () => {
  meta.setLeadsStatus('DISAPPROVED')
  await page.goto('/app/dashboard')
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect.poll(() => sql(`select count(*) from "Alert" where "workspaceId"='${ws}' and kind='campaign_rejected'`)).toBe('1')

  meta.failNext(/\/act_1\/campaigns$/, 190, 'Error validating access token: The user has not authorized application.')
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect.poll(() => sql(`select count(*) from "Alert" where "workspaceId"='${ws}' and kind='account_disconnected'`)).toBe('1')
  expect(sql(`select status from "SocialAccount" where "workspaceId"='${ws}' and network='META_ADS'`)).toBe('EXPIRED')
})

test('alerts page, unread badge, mark read, email switch', async () => {
  await page.goto('/app/alerts')
  const unread = Number(sql(`select count(*) from "Alert" where "workspaceId"='${ws}' and "readAt" is null`))
  expect(unread).toBeGreaterThanOrEqual(5)
  await expect(page.getByRole('link', { name: /Alerts/ }).first()).toContainText(String(unread))
  await expect(page.getByText('Meta rejected Lead Gen — Tbilisi')).toBeVisible()
  await page.getByRole('button', { name: 'Mark all read' }).click()
  await expect(page.getByText('NEW', { exact: true })).toHaveCount(0)
  await page.getByLabel('Email me alerts').uncheck()
  await expect.poll(() => sql(`select "alertEmails" from "Account" where id=(select "accountId" from "Workspace" where id='${ws}')`)).toBe('f')
})

test('dashboard shows goal status per campaign and the alert banner', async () => {
  sql(`update "Alert" set "readAt"=null where "workspaceId"='${ws}' and kind='campaign_rejected'`)
  await page.goto('/app/dashboard')
  await expect(page.getByRole('link', { name: /1 alert needs your attention/ })).toBeVisible()
  await expect(page.locator('tr', { hasText: 'Lead Gen — Tbilisi' })).toContainText('Off track')
})

test('partner workspaces get alerts by signed webhook', async () => {
  const id = `pt${Date.now()}`
  sql(`insert into "Partner"(id,name,slug,mode,"webhookUrl","webhookSecret","updatedAt") values ('${id}','Hook Partner','${id}','MULTI','http://127.0.0.1:${FAKE_META_PORT}/hook','whsec_test',now())`)
  sql(`insert into "Workspace"(id,name,"partnerId","externalId","updatedAt") values ('w${id}','Partner WS','${id}','ext-42',now())`)
  sql(`insert into "Alert"(id,"workspaceId",kind,severity,title,body) values ('a${id}','w${id}','goal_off_track','CRITICAL','CPL above target','₾7 vs ₾5')`)
  await page.request.post('/api/cron/tick', { headers: { 'x-khma-cron': cron } })
  const hook = meta.hooks.find((h) => h.body.includes(`a${id}`))!
  expect(hook).toBeTruthy()
  const ts = String(hook.headers['x-khma-timestamp'])
  const expected = createHmac('sha256', 'whsec_test').update(`${ts}.${hook.body}`).digest('hex')
  expect(hook.headers['x-khma-signature']).toBe(`sha256=${expected}`)
  const payload = JSON.parse(hook.body)
  expect(payload).toMatchObject({ type: 'alert.created', workspace: { externalId: 'ext-42' }, alert: { kind: 'goal_off_track', severity: 'critical' } })
  expect(sql(`select "webhookAt" is not null from "Alert" where id='a${id}'`)).toBe('t')
})
