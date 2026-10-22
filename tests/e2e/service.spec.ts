import { expect, test, type Page } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { startFakeSocial } from './fake-social'
import { newAccount, onceAppDialog, sql } from './helpers'

// When a plan has ended (after 3 grace days for a paid one): scheduled posts
// are held back, "Publish now" and connecting channels are refused, and the
// banner says so. Partner customers pay by credits: always served, with
// Business limits until they pick a plan.

test.describe.configure({ mode: 'serial' })

const social = startFakeSocial()
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
)
const cron = createHmac('sha256', `cron:${env.KHMA_ENCRYPTION_KEY}`).update('tick').digest('hex')
let page: Page
let workspaceId = ''
let accountId = ''
const ENDED = 'Your plan has ended. Renew it to publish and connect channels again — your posts, channels and credits are kept.'
const tick = () => page.request.post('/api/cron/tick', { headers: { 'x-khma-cron': cron } })
const scheduledPost = (content: string) => {
  const id = `svcpost${Date.now()}${Math.floor(Math.random() * 1e4)}`
  sql(
    `insert into "Post"(id,"workspaceId",kind,status,content,hashtags,"mediaIds",channels,"scheduledAt","updatedAt") values ('${id}','${workspaceId}','SOCIAL','SCHEDULED','${content}','{}','{}','{TELEGRAM}',now() - interval '1 minute',now())`,
  )
  return id
}
const status = (id: string) => sql(`select status from "Post" where id='${id}'`)

test.beforeAll(async ({ browser }) => {
  await social.listen()
  page = await browser.newPage()
  const { brand } = await newAccount(page, 'svc', `Svc ${Date.now()}`)
  workspaceId = sql(`select id from "Workspace" where name='${brand}'`)
  accountId = sql(`select "accountId" from "Workspace" where id='${workspaceId}'`)
  // A Telegram channel, connected while the trial runs.
  await page.goto('/app/channels')
  await page.getByRole('region', { name: 'Telegram channel', exact: true }).getByRole('button', { name: 'Connect' }).click()
  const form = page.getByRole('form', { name: 'Connect Telegram' })
  await form.getByPlaceholder('@yourchannel or t.me/yourchannel').fill('@bloomnews')
  await form.getByRole('button', { name: 'Connect channel' }).click()
  await expect(page.getByText('Bloom News')).toBeVisible()
})
test.afterAll(async () => {
  await page.close()
  await social.close()
})

test('in the grace days after a paid period, everything still works and the banner says when it stops', async () => {
  sql(`update "Account" set plan='STARTER', "trialEndsAt"=now() - interval '40 days', "paidUntil"=now() - interval '1 day' where id='${accountId}'`)
  const post = scheduledPost('Grace day post')
  await tick()
  await expect.poll(() => status(post)).toBe('PUBLISHED')
  await page.goto('/app/dashboard')
  await expect(page.getByText(/Publishing stops on .* unless you renew\./)).toBeVisible()
})

test('after the grace days: scheduled posts wait, Publish now and connecting are refused', async () => {
  sql(`update "Account" set "paidUntil"=now() - interval '4 days' where id='${accountId}'`)
  const post = scheduledPost('Held back post')
  await tick()
  expect(status(post)).toBe('SCHEDULED')

  const now = scheduledPost('Publish now post')
  await page.goto(`/app/posts/${now}`)
  onceAppDialog(page, (d) => d.accept())
  await page.getByRole('button', { name: 'Publish now' }).click()
  await expect(page.getByText(ENDED)).toBeVisible()
  expect(status(now)).not.toBe('PUBLISHED')
  expect(status(post)).toBe('SCHEDULED')

  await page.goto('/app/channels')
  await expect(page.getByText('Publishing and connecting channels are paused until you renew.', { exact: false })).toBeVisible()
  await page.getByRole('region', { name: 'Telegram channel', exact: true }).getByRole('button', { name: /Connect/ }).first().click()
  const form = page.getByRole('form', { name: 'Connect Telegram' })
  await form.getByPlaceholder('@yourchannel or t.me/yourchannel').fill('@otherchan')
  await form.getByRole('button', { name: 'Connect channel' }).click()
  await expect(form.getByText(ENDED)).toBeVisible()

  // Renewed: the held-back post goes out on the next tick (it is still within the publishing window).
  sql(`update "Account" set "paidUntil"=now() + interval '30 days' where id='${accountId}'`)
  await tick()
  await expect.poll(() => status(post)).toBe('PUBLISHED')
})

test('a partner customer without a plan is served, with Business limits', async () => {
  const partner = `svc-partner-${Date.now()}`
  sql(`insert into "Partner"(id, name, slug, "updatedAt") values ('${partner}', 'Svc Partner', '${partner}', now())`)
  sql(`update "Account" set plan='NONE', "trialEndsAt"=null, "paidUntil"=null, "partnerId"='${partner}' where id='${accountId}'`)
  try {
    await page.goto('/app/channels')
    await expect(page.getByText(/Social profiles: \d+ of 15 on your plan/)).toBeVisible()
    const post = scheduledPost('Partner post')
    await tick()
    await expect.poll(() => status(post)).toBe('PUBLISHED')
  } finally {
    sql(`update "Account" set "partnerId"=null where id='${accountId}'`)
  }
})
