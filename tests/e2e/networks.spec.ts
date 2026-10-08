import { expect, test, type Page } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { startFakeGoogle } from './fake-google'
import { startFakeSocial } from './fake-social'
import { newAccount, sql, onceAppDialog } from './helpers'

// TikTok, LinkedIn, YouTube, X, Threads, Pinterest and Telegram: connect,
// publish, read numbers, refresh tokens — against tests/e2e/fake-social.ts
// (and fake-google.ts for YouTube's Google sign-in).

test.describe.configure({ mode: 'serial' })

const social = startFakeSocial()
const google = startFakeGoogle()
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
)
const cron = createHmac('sha256', `cron:${env.KHMA_ENCRYPTION_KEY}`).update('tick').digest('hex')

let page: Page
let workspaceId = ''
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

function addMedia(kind: 'IMAGE' | 'VIDEO') {
  const id = `net${kind.toLowerCase()}${Date.now()}${Math.floor(Math.random() * 1e4)}`
  const ext = kind === 'VIDEO' ? 'mp4' : 'png'
  const bytes = kind === 'VIDEO' ? Buffer.alloc(300_000, 7) : PNG
  const rel = `${workspaceId}/${id}.${ext}`
  mkdirSync(path.join('storage', workspaceId), { recursive: true })
  writeFileSync(path.join('storage', rel), bytes)
  sql(
    `insert into "Media"(id,"workspaceId",kind,mime,path,bytes,width,height,"durationMs") values ('${id}','${workspaceId}','${kind}','${kind === 'VIDEO' ? 'video/mp4' : 'image/png'}','${rel}',${bytes.length},1080,1920,${kind === 'VIDEO' ? 15000 : 'null'})`,
  )
  return id
}

function addPost(content: string, channels: string[], mediaIds: string[] = [], cta?: object) {
  const id = `netpost${Date.now()}${Math.floor(Math.random() * 1e4)}`
  sql(
    `insert into "Post"(id,"workspaceId",kind,status,content,hashtags,"mediaIds",channels,cta,"updatedAt") values ('${id}','${workspaceId}','SOCIAL','DRAFT','${content}','{bakery}','{${mediaIds.join(',')}}','{${channels.join(',')}}',${cta ? `'${JSON.stringify(cta)}'` : 'null'},now())`,
  )
  return id
}

async function publish(id: string) {
  await page.goto(`/app/posts/${id}`)
  onceAppDialog(page, (d) => d.accept())
  await page.getByRole('button', { name: 'Publish now' }).click()
  await expect(page.getByText('Published to', { exact: true })).toBeVisible()
}
const delivery = (postId: string, network: string) =>
  sql(`select d.status||'|'||coalesce(d."externalId",'')||'|'||coalesce(d.permalink,'')||'|'||coalesce(d.error,'') from "PostDelivery" d join "SocialAccount" a on a.id=d."socialAccountId" where d."postId"='${postId}' and a.network='${network}' limit 1`)
const card = (name: string) => page.getByRole('region', { name, exact: true })

test.beforeAll(async ({ browser }) => {
  await social.listen()
  page = await browser.newPage()
  const { brand } = await newAccount(page, 'nets', `Nets ${Date.now()}`)
  workspaceId = sql(`select id from "Workspace" where name='${brand}'`)
  // Room for every profile below.
  sql(`update "Account" set plan='AGENCY' where id=(select "accountId" from "Workspace" where id='${workspaceId}')`)
})
test.afterAll(async () => {
  await page.close()
  await social.close()
})

test('Telegram: the bot must be an admin that may post; then the channel is connected', async () => {
  await page.goto('/app/channels')
  const tg = card('Telegram channel')
  await tg.getByRole('button', { name: 'Connect' }).click()
  const form = page.getByRole('form', { name: 'Connect Telegram' })
  await expect(form.getByText('@LoudpilotTestBot')).toBeVisible()
  await form.getByPlaceholder('@yourchannel or t.me/yourchannel').fill('@nobot')
  await form.getByRole('button', { name: 'Connect channel' }).click()
  await expect(form.getByText(/Add the bot as a channel admin first/)).toBeVisible()
  await form.getByPlaceholder('@yourchannel or t.me/yourchannel').fill('t.me/readonlychan')
  await form.getByRole('button', { name: 'Connect channel' }).click()
  await expect(form.getByText(/Turn on "Post messages"/)).toBeVisible()
  await form.getByPlaceholder('@yourchannel or t.me/yourchannel').fill('@bloomnews')
  await form.getByRole('button', { name: 'Connect channel' }).click()
  await expect(tg.getByText('Bloom News')).toBeVisible()
  const row = sql(`select "externalId"||'|'||handle||'|'||"accessTokenEnc" from "SocialAccount" where "workspaceId"='${workspaceId}' and network='TELEGRAM'`)
  expect(row).toMatch(/^-1001234567890\|bloomnews\|/)
  expect(row).not.toContain('platform-token')
})

test('Telegram: a post with a photo goes out with the text as its caption', async () => {
  const id = addPost('Fresh rye today', ['TELEGRAM'], [addMedia('IMAGE')])
  await publish(id)
  expect(delivery(id, 'TELEGRAM')).toMatch(/^PUBLISHED\|\d+\|https:\/\/t\.me\/bloomnews\/\d+\|$/)
  const sent = social.calls.filter((c) => c.path.endsWith('/sendPhoto')).at(-1)!
  expect(sent.path).toContain('111:platform-token')
  expect((sent.body as { caption: string }).caption).toBe('Fresh rye today\n\n#bakery')
  expect(social.fetched.at(-1)!.status).toBe(200)
})

test('OAuth networks connect; tokens are stored encrypted; X uses PKCE', async () => {
  await google.listen()
  try {
    for (const [name, expected] of [
      ['TikTok', 1],
      ['LinkedIn', 2],
      ['X', 1],
      ['Threads', 1],
      ['Pinterest', 1],
      ['YouTube', 1],
    ] as const) {
      await page.goto('/app/channels')
      await card(name).getByRole('link', { name: 'Connect' }).click()
      await page.waitForURL(new RegExp(`/app/channels\\?connected=${expected}`))
    }
  } finally {
    await google.close()
  }
  const rows = sql(`select network||':'||"externalId"||':'||"accessTokenEnc" from "SocialAccount" where "workspaceId"='${workspaceId}' order by network`)
  for (const id of ['TIKTOK:tt-open-1', 'LINKEDIN:urn:li:person:li-member-1', 'LINKEDIN:urn:li:organization:5555', 'X:x-user-1', 'THREADS:th-user-1', 'PINTEREST:bloombakery', 'YOUTUBE:UC-bloom']) expect(rows).toContain(id)
  for (const secret of ['tt-access', 'li-access', 'x-access', 'th-long', 'pina-']) expect(rows).not.toContain(secret)

  const auth = social.calls.find((c) => c.path === '/x/authorize')!
  expect(auth.query.code_challenge_method).toBe('S256')
  const token = social.calls.find((c) => c.path === '/x/2/oauth2/token')!
  expect((token.body as Record<string, string>).code_verifier).toMatch(/^[\w-]{43}$/)
  expect(token.headers.authorization).toMatch(/^Basic /)
  // Threads swaps the short token for a 60-day one.
  expect(social.calls.some((c) => c.path === '/threads/access_token' && c.query.grant_type === 'th_exchange_token')).toBe(true)

  await page.goto('/app/channels')
  await expect(card('LinkedIn').getByText('Company Page', { exact: true })).toBeVisible()
  await expect(card('TikTok').getByText(/private \("Only me"\)/)).toBeVisible()
  // Pinterest posts to the board picked here.
  await card('Pinterest').getByLabel('Pinterest board').selectOption('b2')
  await expect.poll(() => sql(`select meta->>'board' from "SocialAccount" where "workspaceId"='${workspaceId}' and network='PINTEREST'`)).toBe('b2')
})

test('one post with a photo: LinkedIn (profile and Page), X, Threads, Pinterest', async () => {
  const img = addMedia('IMAGE')
  const id = addPost('Weekend menu (new) — 20% off', ['LINKEDIN', 'X', 'THREADS', 'PINTEREST'], [img], { type: 'SHOP', url: 'https://bloom.example/menu' })
  await publish(id)
  expect(sql(`select count(*) from "PostDelivery" where "postId"='${id}' and status='PUBLISHED'`)).toBe('5')

  // LinkedIn: image uploaded for each author; reserved characters escaped, hashtag kept.
  const li = social.calls.filter((c) => c.path === '/linkedin/rest/posts')
  expect(li.map((c) => (c.body as { author: string }).author).sort()).toEqual(['urn:li:organization:5555', 'urn:li:person:li-member-1'])
  const liBody = li[0].body as { commentary: string; content: { media: { id: string } } }
  expect(liBody.commentary).toContain('Weekend menu \\(new\\) — 20% off')
  expect(liBody.commentary).toContain('#bakery')
  expect(liBody.content.media.id).toMatch(/^urn:li:image:/)
  expect(li[0].headers['linkedin-version']).toMatch(/^\d{6}$/)
  expect(delivery(id, 'LINKEDIN')).toMatch(/^PUBLISHED\|urn:li:share:\d+\|https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:share:\d+\/\|/)

  // X: media uploaded first, then the post with its id; link tagged for X.
  const tweet = social.calls.filter((c) => c.path === '/x/2/tweets').at(-1)!.body as { text: string; media: { media_ids: string[] } }
  expect(tweet.media.media_ids[0]).toMatch(/^xm\d+/)
  expect(tweet.text).toContain('utm_source=x')
  expect(delivery(id, 'X')).toMatch(/\|https:\/\/x\.com\/bloombakery\/status\/\d+\|/)

  // Threads: an image container, checked until ready, then published.
  const th = social.calls.filter((c) => c.path === '/threads/v1.0/th-user-1/threads').at(-1)!.body as Record<string, string>
  expect(th.media_type).toBe('IMAGE')
  expect(social.calls.some((c) => c.path === '/threads/v1.0/th-user-1/threads_publish')).toBe(true)
  expect(delivery(id, 'THREADS')).toMatch(/threads\.net\/@bloombakery\/post\//)

  // Pinterest: on the picked board, linking to the site.
  const pin = social.calls.filter((c) => c.path === '/pinterest/pins').at(-1)!.body as { board_id: string; link: string; title: string; media_source: { source_type: string } }
  expect(pin.board_id).toBe('b2')
  expect(pin.link).toContain('utm_source=pinterest')
  expect(pin.title).toBe('Weekend menu (new) — 20% off')
  expect(pin.media_source.source_type).toBe('image_url')
})

test('networks that need media say so; TikTok needs the visibility chosen in the post', async () => {
  const id = addPost('Only words', ['PINTEREST', 'YOUTUBE', 'TIKTOK'])
  await publish(id)
  expect(delivery(id, 'PINTEREST')).toContain('Pinterest needs a photo or a video')
  expect(delivery(id, 'YOUTUBE')).toContain('YouTube needs a video')
  expect(delivery(id, 'TIKTOK')).toContain('TikTok needs a video')

  const video = addMedia('VIDEO')
  const v = addPost('Behind the scenes at 5am', ['TIKTOK', 'YOUTUBE'], [video])
  await publish(v)
  expect(delivery(v, 'TIKTOK')).toContain('Choose who can see this TikTok post')
  expect(delivery(v, 'YOUTUBE')).toMatch(/^PUBLISHED\|yt\d+vid\|https:\/\/www\.youtube\.com\/shorts\/yt\d+vid\|/)
  const yt = social.calls.filter((c) => c.path === '/youtube/upload/youtube/v3/videos').at(-1)!
  expect(yt.query.uploadType).toBe('resumable')
  expect(yt.headers['x-upload-content-length']).toBe('300000')
  expect((yt.body as { snippet: { title: string } }).snippet.title).toBe('Behind the scenes at 5am')
  expect(social.calls.filter((c) => c.path.startsWith('/youtube/session/')).at(-1)!.bytes).toBe(300_000)

  // TikTok settings in the editor: account shown, nothing preselected.
  await page.goto(`/app/posts/${v}`)
  const tt = page.getByRole('region', { name: 'TikTok settings' })
  await expect(tt.getByText('Posting as Bloom Bakery')).toBeVisible()
  await expect(tt.getByLabel('TikTok visibility')).toHaveValue('')
  await expect(tt.getByLabel('Allow Duet (off in TikTok)')).toBeDisabled()
  await expect(tt.getByText('Music Usage Confirmation')).toBeVisible()
  await tt.getByLabel('TikTok visibility').selectOption('PUBLIC_TO_EVERYONE')
  await tt.getByLabel('Allow comments').check()
  await page.getByRole('button', { name: /^Save/ }).first().click()
  await expect.poll(() => sql(`select "networkOptions"->'TIKTOK'->>'privacy' from "Post" where id='${v}'`)).toBe('PUBLIC_TO_EVERYONE')
  // YouTube already has it: only what failed is sent again.
  onceAppDialog(page, (d) => d.accept())
  await page.getByRole('button', { name: 'Retry failed' }).click()
  await expect.poll(() => delivery(v, 'TIKTOK')).toMatch(/^PUBLISHED\|7123456789\|https:\/\/www\.tiktok\.com\/@bloombakery\/video\/7123456789\|/)
  const init = social.calls.filter((c) => c.path === '/tiktok/v2/post/publish/video/init/').at(-1)!.body as {
    post_info: Record<string, unknown>
    source_info: Record<string, number | string>
  }
  expect(init.post_info).toMatchObject({ privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false, disable_duet: true, disable_stitch: true })
  expect(init.source_info).toMatchObject({ source: 'FILE_UPLOAD', video_size: 300000, chunk_size: 300000, total_chunk_count: 1 })
  expect(social.calls.filter((c) => c.path.startsWith('/tiktok/upload/')).at(-1)!.headers['content-range']).toBe('bytes 0-299999/300000')
})

test('numbers are read back from every network', async () => {
  sql(`update "PostDelivery" set "metricsAt"=null where "postId" in (select id from "Post" where "workspaceId"='${workspaceId}')`)
  const r = await page.request.post('/api/cron/tick?insights=1', { headers: { 'x-khma-cron': cron } }).then((x) => x.json())
  expect(r.insights).toBeGreaterThan(0)
  const m = (network: string) =>
    JSON.parse(sql(`select coalesce(d.metrics::text,'{}') from "PostDelivery" d join "SocialAccount" a on a.id=d."socialAccountId" where a."workspaceId"='${workspaceId}' and a.network='${network}' and d.status='PUBLISHED' order by d."createdAt" desc limit 1`))
  expect(m('X')).toMatchObject({ views: 1200, likes: 40, comments: 5, shares: 4, saves: 2 })
  expect(m('THREADS')).toMatchObject({ views: 300, likes: 25, comments: 3, shares: 4 })
  expect(m('PINTEREST')).toMatchObject({ views: 800, saves: 15 })
  expect(m('YOUTUBE')).toMatchObject({ views: 1500, likes: 80, comments: 9 })
  expect(m('TIKTOK')).toMatchObject({ views: 900, likes: 70 })
  const org = JSON.parse(
    sql(`select coalesce(d.metrics::text,'{}') from "PostDelivery" d join "SocialAccount" a on a.id=d."socialAccountId" where a."workspaceId"='${workspaceId}' and a."externalId"='urn:li:organization:5555' order by d."createdAt" desc limit 1`),
  )
  expect(org).toMatchObject({ views: 500, reach: 320, likes: 30 })
})

test('an expired X token is refreshed once and the new refresh token kept', async () => {
  sql(`update "SocialAccount" set "expiresAt"=(now() at time zone 'utc') - interval '1 minute' where "workspaceId"='${workspaceId}' and network='X'`)
  const before = sql(`select "refreshTokenEnc" from "SocialAccount" where "workspaceId"='${workspaceId}' and network='X'`)
  const id = addPost('Fresh after refresh', ['X'])
  await publish(id)
  expect(delivery(id, 'X')).toMatch(/^PUBLISHED/)
  const refresh = social.calls.filter((c) => c.path === '/x/2/oauth2/token' && (c.body as Record<string, string>).grant_type === 'refresh_token')
  expect(refresh).toHaveLength(1)
  expect(sql(`select "refreshTokenEnc" from "SocialAccount" where "workspaceId"='${workspaceId}' and network='X'`)).not.toBe(before)
  expect(Number(sql(`select extract(epoch from "expiresAt" - (now() at time zone 'utc')) from "SocialAccount" where "workspaceId"='${workspaceId}' and network='X'`))).toBeGreaterThan(7000)
})

test('a revoked token marks the account for reconnecting', async () => {
  social.failNext(/^\/x\/2\/tweets$/, 401, { title: 'Unauthorized', detail: 'Unauthorized', status: 401 })
  const id = addPost('This one fails', ['X'])
  await publish(id)
  expect(delivery(id, 'X')).toMatch(/^FAILED\|\|\|Unauthorized/)
  expect(sql(`select status from "SocialAccount" where "workspaceId"='${workspaceId}' and network='X'`)).toBe('EXPIRED')
  await page.goto('/app/channels')
  await expect(card('X').getByText(/Needs reconnecting/)).toBeVisible()
})

test('the plan limit counts every network', async () => {
  sql(`update "Account" set plan='STARTER' where id=(select "accountId" from "Workspace" where id='${workspaceId}')`)
  try {
    sql(`delete from "SocialAccount" where "workspaceId"='${workspaceId}' and network='THREADS'`)
    await page.goto('/app/channels')
    await expect(page.getByText(/Social profiles: \d+ of 5/)).toBeVisible()
    await card('Threads').getByRole('link', { name: 'Connect' }).click()
    await page.waitForURL(/error=profiles/)
  } finally {
    sql(`update "Account" set plan='AGENCY' where id=(select "accountId" from "Workspace" where id='${workspaceId}')`)
  }
})
