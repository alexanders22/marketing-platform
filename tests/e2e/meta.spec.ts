import { expect, test, type Page } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { startFakeMeta, signedRequest } from './fake-meta'
import { newAccount, sql } from './helpers'

// Meta connect → publish → insights → token expiry → data deletion, against
// tests/e2e/fake-meta.ts. Needs the dev server started with the fake Meta env
// (META_APP_ID, META_APP_SECRET=test-secret, META_GRAPH_URL, META_DIALOG_URL).

test.describe.configure({ mode: 'serial' })

const meta = startFakeMeta()
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
)
const cron = createHmac('sha256', `cron:${env.KHMA_ENCRYPTION_KEY}`).update('tick').digest('hex')
const tick = (page: Page, insights = false) =>
  page.request.post(`/api/cron/tick${insights ? '?insights=1' : ''}`, { headers: { 'x-khma-cron': cron } }).then((r) => r.json())

let page: Page
let workspaceId = ''

// 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

function addImage() {
  const id = `testimg${Date.now()}`
  const rel = `${workspaceId}/${id}.png`
  mkdirSync(path.join('storage', workspaceId), { recursive: true })
  writeFileSync(path.join('storage', rel), PNG)
  sql(`insert into "Media"(id,"workspaceId",kind,mime,path,bytes) values ('${id}','${workspaceId}','IMAGE','image/png','${rel}',${PNG.length})`)
  return id
}

function addPost(content: string, extra: { mediaIds?: string[]; status?: string; scheduledAt?: string } = {}) {
  const id = `testpost${Date.now()}${Math.floor(Math.random() * 1e4)}`
  const media = `{${(extra.mediaIds ?? []).join(',')}}`
  sql(
    `insert into "Post"(id,"workspaceId",kind,status,content,hashtags,"mediaIds",channels,"scheduledAt","updatedAt") values ('${id}','${workspaceId}','SOCIAL','${extra.status ?? 'DRAFT'}','${content}','{bakery,fresh}','${media}','{FACEBOOK,INSTAGRAM}',${extra.scheduledAt ? `'${extra.scheduledAt}'` : 'null'},now())`,
  )
  return id
}

test.beforeAll(async ({ browser }) => {
  await meta.listen()
  page = await browser.newPage()
  await newAccount(page, 'meta')
})
test.afterAll(async () => {
  await page.close()
  await meta.close()
})

test('connect Facebook Page, Instagram and ad account', async () => {
  await page.goto('/app/channels')
  await page.locator('a[href="/auth/meta"]').click()
  await page.waitForURL(/\/app\/channels\?connected=3/)
  await expect(page.getByText('Connected 3 accounts.')).toBeVisible()
  await expect(page.getByText('@bloombakery')).toBeVisible()
  await expect(page.getByText('Bloom Ads')).toBeVisible()

  workspaceId = sql(`select "workspaceId" from "SocialAccount" where "externalId"='ig-1' order by "createdAt" desc limit 1`)
  const rows = sql(`select network||':'||"connectedBy"||':'||coalesce("parentId",'-')||':'||"accessTokenEnc" from "SocialAccount" where "workspaceId"='${workspaceId}' order by network`)
  expect(rows).toContain('FACEBOOK:meta-user-1:-:')
  expect(rows).toContain('INSTAGRAM:meta-user-1:page-1:')
  expect(rows).not.toContain('page-token-1')
  expect(rows).not.toContain('long-user-token')
  // OAuth asked for the publishing + insights scopes.
  const dialog = meta.calls.find((c) => c.path === '/dialog/oauth')!
  expect(dialog.params.scope).toContain('pages_manage_posts')
  expect(dialog.params.scope).toContain('instagram_content_publish')
})

test('state mismatch is refused', async () => {
  await page.goto('/auth/meta/callback?code=x&state=forged')
  await expect(page).toHaveURL(/error=meta-state/)
  await expect(page.getByText('The connection expired')).toBeVisible()
})

test('publish now: text-only goes to Facebook, Instagram needs an image', async () => {
  const id = addPost('Fresh croissants today')
  await page.goto(`/app/posts/${id}`)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Publish now' }).click()
  await expect(page.getByText('failed on 1')).toBeVisible()
  await expect(page.getByText('Instagram posts need at least one image')).toBeVisible()
  await expect(page.getByRole('link', { name: 'View' })).toHaveAttribute('href', /facebook\.test/)
  expect(sql(`select status from "Post" where id='${id}'`)).toBe('PUBLISHED')
  const feed = meta.calls.filter((c) => c.path === '/page-1/feed').at(-1)!
  expect(feed.params.message).toBe('Fresh croissants today\n\n#bakery #fresh')
})

test('publish with an image: both networks fetch it through a signed link', async () => {
  const img = addImage()
  const id = addPost('Pistachio week', { mediaIds: [img] })
  await page.goto(`/app/posts/${id}`)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Publish now' }).click()
  await expect(page.getByText('Published to 2 accounts.')).toBeVisible()
  const fetched = meta.fetchedImages.filter((f) => f.url.includes(img))
  expect(fetched.length).toBe(2)
  for (const f of fetched) expect([f.status, f.type]).toEqual([200, 'image/png'])
  expect(sql(`select count(*) from "PostDelivery" where "postId"='${id}' and status='PUBLISHED'`)).toBe('2')

  // The same link with a forged signature, or no signature, is refused.
  const signed = new URL(fetched[0].url)
  expect((await fetch(`${signed.origin}${signed.pathname}?exp=${signed.searchParams.get('exp')}&sig=forged`)).status).toBe(404)
  expect((await fetch(`${signed.origin}${signed.pathname}`)).status).toBe(404)
})

test('scheduled post is sent by the ticker; planner drafts are not', async () => {
  const img = addImage()
  const scheduled = addPost('Weekend special', { mediaIds: [img], status: 'SCHEDULED', scheduledAt: new Date(Date.now() - 60_000).toISOString() })
  const draft = addPost('Just an idea', { status: 'DRAFT', scheduledAt: new Date(Date.now() - 60_000).toISOString() })
  const future = addPost('Next week', { mediaIds: [img], status: 'SCHEDULED', scheduledAt: new Date(Date.now() + 86_400_000).toISOString() })
  expect((await tick(page)).published).toBeGreaterThanOrEqual(1)
  expect(sql(`select status from "Post" where id='${scheduled}'`)).toBe('PUBLISHED')
  expect(sql(`select status from "Post" where id='${draft}'`)).toBe('DRAFT')
  expect(sql(`select status from "Post" where id='${future}'`)).toBe('SCHEDULED')
  // A second tick does not publish it again.
  const before = meta.calls.filter((c) => c.path === '/ig-1/media_publish').length
  await tick(page)
  expect(meta.calls.filter((c) => c.path === '/ig-1/media_publish').length).toBe(before)
})

test('schedule button needs a future time and a connected network', async () => {
  const id = addPost('Schedule me')
  await page.goto(`/app/posts/${id}`)
  await page.locator('input[type="datetime-local"]').fill('2020-01-01T10:00')
  await page.getByRole('button', { name: 'Schedule' }).click()
  await expect(page.getByText('Pick a time in the future')).toBeVisible()
  await page.locator('input[type="datetime-local"]').fill('2099-01-01T10:00')
  await page.getByRole('button', { name: 'Schedule' }).click()
  await expect(page.getByText('Scheduled', { exact: true })).toBeVisible()
  expect(sql(`select status from "Post" where id='${id}'`)).toBe('SCHEDULED')
  await page.getByRole('button', { name: 'Unschedule — keep as draft' }).click()
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()
})

test('insights are read back and shown on the post', async () => {
  expect((await tick(page, true)).insights).toBeGreaterThan(0)
  const id = sql(`select "postId" from "PostDelivery" d join "SocialAccount" a on a.id=d."socialAccountId" where a."workspaceId"='${workspaceId}' and a.network='INSTAGRAM' and d.status='PUBLISHED' limit 1`)
  const metrics = JSON.parse(sql(`select metrics::text from "PostDelivery" d join "SocialAccount" a on a.id=d."socialAccountId" where d."postId"='${id}' and a.network='INSTAGRAM'`))
  expect(metrics).toMatchObject({ reach: 420, views: 610, likes: 37, saves: 9, interactions: 53 })
  const fb = JSON.parse(sql(`select metrics::text from "PostDelivery" d join "SocialAccount" a on a.id=d."socialAccountId" where d."postId"='${id}' and a.network='FACEBOOK'`))
  expect(fb).toMatchObject({ reach: 1200, views: 1500, likes: 25, comments: 4, shares: 3 })
  await page.goto(`/app/posts/${id}`)
  await expect(page.getByText('1,200')).toBeVisible()
})

test('expired token marks the account for reconnecting', async () => {
  const id = addPost('Token test')
  meta.failNextPublish(190, 'Error validating access token: Session has expired')
  await page.goto(`/app/posts/${id}`)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Publish now' }).click()
  await expect(page.getByText('Session has expired').first()).toBeVisible()
  await page.goto('/app/channels')
  await expect(page.getByText(/Needs reconnecting/)).toBeVisible()
})

test('Meta data deletion callback removes everything and reports status', async () => {
  const bad = await page.request.post('/api/meta/data-deletion', { form: { signed_request: signedRequest({ user_id: 'meta-user-1' }, 'wrong') } })
  expect(bad.status()).toBe(400)

  const res = await page.request.post('/api/meta/data-deletion', { form: { signed_request: signedRequest({ user_id: 'meta-user-1' }) } })
  expect(res.ok()).toBe(true)
  const body = await res.json()
  expect(body.url).toContain(`/data-deletion?code=${body.confirmation_code}`)
  expect(sql(`select count(*) from "SocialAccount" where "connectedBy"='meta-user-1'`)).toBe('0')
  expect(sql(`select count(*) from "PostDelivery" d join "Post" p on p.id=d."postId" where p."workspaceId"='${workspaceId}'`)).toBe('0')

  await page.goto(`/data-deletion?code=${body.confirmation_code}`)
  await expect(page.getByText(/^Completed on/)).toBeVisible()
  await page.goto('/app/channels')
  await expect(page.getByText('@bloombakery')).toHaveCount(0)
})

test('disconnect from Channels', async () => {
  await page.goto('/app/channels')
  await page.locator('a[href="/auth/meta"]').click()
  await page.waitForURL(/connected=3/)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Disconnect Bloom Ads' }).click()
  await expect(page.getByText('Bloom Ads')).toHaveCount(0)
  expect(sql(`select count(*) from "SocialAccount" where "workspaceId"='${workspaceId}'`)).toBe('2')
})
