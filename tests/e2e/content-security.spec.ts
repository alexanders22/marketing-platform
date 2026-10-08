import { expect, request as pwRequest, test, type BrowserContext, type Page } from '@playwright/test'
import { newAccount, sql, onceAppDialog } from './helpers'

// Upload endpoint + cross-workspace checks for content server actions.
// Server-action bodies are rewritten in flight (page.route) so the real
// client code path, headers and action ids are used.

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC',
  'base64',
)
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG })
const accountIdOf = (email: string) =>
  sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${email}' order by m.id limit 1`)
const workspaceIdOf = (email: string) =>
  sql(`select w.id from "Workspace" w where w."accountId"='${accountIdOf(email)}' order by w."createdAt" limit 1`)

type Captured = { url: string; headers: Record<string, string>; body: string }

// Rewrites the args of the next server-action call whose args match `when`.
async function rewriteAction(page: Page, when: (args: unknown[]) => boolean, mutate: (args: unknown[]) => unknown[]) {
  const seen: Captured[] = []
  await page.route('**/*', async (route) => {
    const req = route.request()
    const headers = await req.allHeaders()
    if (req.method() !== 'POST' || !headers['next-action']) return route.fallback()
    const body = req.postData() ?? ''
    let args: unknown[]
    try {
      args = JSON.parse(body)
    } catch {
      return route.fallback()
    }
    if (!Array.isArray(args) || !when(args)) return route.fallback()
    const postData = JSON.stringify(mutate(args))
    seen.push({ url: req.url(), headers, body: postData })
    await route.continue({ postData })
  })
  return seen
}

let ctxA: BrowserContext, ctxB: BrowserContext
let A: Page, B: Page
let emailA: string, emailB: string
const problems: string[] = []

test.beforeAll(async ({ browser }) => {
  ctxA = await browser.newContext()
  ctxB = await browser.newContext()
  A = await ctxA.newPage()
  B = await ctxB.newPage()
  ;({ email: emailA } = await newAccount(A, 'qa-content-a'))
  ;({ email: emailB } = await newAccount(B, 'qa-content-b'))
  for (const p of [A, B]) {
    p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
    p.on('response', (r) => r.status() >= 500 && problems.push(`${r.status()} ${r.url()}`))
  }
})
test.afterAll(async () => {
  await ctxA?.close()
  await ctxB?.close()
})
test.afterEach(() => {
  expect.soft(problems, 'page errors / 5xx').toEqual([])
  problems.length = 0
})

const picker = (p: Page) => p.getByRole('dialog', { name: 'Add images' })

async function openPicker(p: Page) {
  await p.goto('/app/posts/new')
  await p.getByRole('button', { name: 'Add images' }).click()
  await expect(picker(p)).toBeVisible()
  await expect(picker(p).getByText('Loading…')).toHaveCount(0)
}

test('uploadMedia rejects non-image bytes (incl. SVG with script) even when the client says image/png', async () => {
  const ws = workspaceIdOf(emailA)
  const before = sql(`select count(*) from "Media" where "workspaceId"='${ws}'`)
  await openPicker(A)
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')
  const seen = await rewriteAction(A, (a) => typeof (a[0] as { data?: unknown })?.data === 'string', () => [{ data: svg }])
  await picker(A).locator('input[type=file]').setInputFiles([png('x.png')])
  await expect(picker(A).getByText('Only PNG, JPG and WebP images are supported')).toBeVisible()
  await expect(picker(A).getByText('Uploading…')).toHaveCount(0)
  expect(seen).toHaveLength(1)
  expect(sql(`select count(*) from "Media" where "workspaceId"='${ws}'`)).toBe(before)

  // Also a text file passed straight to the action.
  await A.unroute('**/*')
  await rewriteAction(A, (a) => typeof (a[0] as { data?: unknown })?.data === 'string', () => [{ data: Buffer.from('hello world, not an image').toString('base64') }])
  await picker(A).locator('input[type=file]').setInputFiles([png('y.png')])
  await expect(picker(A).getByText('Only PNG, JPG and WebP images are supported')).toBeVisible()
  expect(sql(`select count(*) from "Media" where "workspaceId"='${ws}'`)).toBe(before)
  await A.unroute('**/*')
})

test('uploadMedia rejects > 6 MB and empty payloads', async () => {
  const ws = workspaceIdOf(emailA)
  const before = sql(`select count(*) from "Media" where "workspaceId"='${ws}'`)
  await openPicker(A)
  const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024 + 10)]).toString('base64')
  await rewriteAction(A, (a) => typeof (a[0] as { data?: unknown })?.data === 'string', () => [{ data: big }])
  await picker(A).locator('input[type=file]').setInputFiles([png('big.png')])
  await expect(picker(A).getByText('Images must be under 6 MB')).toBeVisible({ timeout: 30_000 })
  await A.unroute('**/*')
  await rewriteAction(A, (a) => typeof (a[0] as { data?: unknown })?.data === 'string', () => [{ data: '' }])
  await picker(A).locator('input[type=file]').setInputFiles([png('empty.png')])
  await expect(picker(A).getByText('Images must be under 6 MB')).toBeVisible()
  await A.unroute('**/*')
  expect(sql(`select count(*) from "Media" where "workspaceId"='${ws}'`)).toBe(before)

  // A genuine upload still works and is stored as JPEG (client re-encodes).
  await picker(A).locator('input[type=file]').setInputFiles([png('ok.png')])
  await expect(picker(A).getByRole('button', { name: 'Add 1 image' })).toBeVisible()
  expect(sql(`select mime from "Media" where "workspaceId"='${ws}' order by "createdAt" desc limit 1`)).toBe('image/png') // PNGs keep transparency
})

test('upload action without a session creates nothing', async ({ baseURL }) => {
  const ws = workspaceIdOf(emailA)
  await openPicker(A)
  const seen = await rewriteAction(A, (a) => typeof (a[0] as { data?: unknown })?.data === 'string', (a) => a)
  await picker(A).locator('input[type=file]').setInputFiles([png('cap.png')])
  await expect(picker(A).getByRole('button', { name: /Add \d image/ })).toBeVisible()
  await A.unroute('**/*')
  expect(seen).toHaveLength(1)
  const before = sql(`select count(*) from "Media"`)
  const anon = await pwRequest.newContext({ baseURL })
  const h = { ...seen[0].headers }
  delete h.cookie
  const res = await anon.post(seen[0].url, { headers: h, data: seen[0].body, maxRedirects: 0 })
  expect(res.status()).toBeLessThan(500)
  expect(sql(`select count(*) from "Media"`)).toBe(before)
  await anon.dispose()
  void ws
})

test('cross-workspace: media, posts and hashtag libraries of another account are not reachable', async ({ baseURL }) => {
  // B owns one image, one post and one library.
  await openPicker(B)
  await picker(B).locator('input[type=file]').setInputFiles([png('b.png')])
  await picker(B).getByRole('button', { name: 'Add 1 image' }).click()
  await B.getByPlaceholder('What do you want to share?').fill('B private post')
  await B.getByRole('button', { name: 'Save draft' }).click()
  await expect(B).toHaveURL(/\/app\/posts\/c/)
  const bPost = B.url().split('/').pop()!
  const wsB = workspaceIdOf(emailB)
  const bMedia = sql(`select id from "Media" where "workspaceId"='${wsB}' limit 1`)
  const libB = `qalibB${Date.now().toString(36)}`
  sql(`insert into "HashtagLibrary"(id,"workspaceId",name,tags,"updatedAt") values ('${libB}','${wsB}','B lib',ARRAY['secret'],now())`)

  // /media access: owner 200, other account 404, anonymous 404.
  expect((await B.request.get(`/media/${bMedia}`)).status()).toBe(200)
  expect((await A.request.get(`/media/${bMedia}`)).status()).toBe(404)
  const anon = await pwRequest.newContext({ baseURL })
  expect((await anon.get(`/media/${bMedia}`)).status()).toBe(404)
  await anon.dispose()

  // A cannot open B's post.
  expect((await A.request.get(`/app/posts/${bPost}`)).status()).toBe(404)
  expect((await A.request.get(`/app/blog/${bPost}`)).status()).toBe(404)

  // A's picker does not list B's media.
  await openPicker(A)
  const aCount = Number(sql(`select count(*) from "Media" where "workspaceId"='${workspaceIdOf(emailA)}'`))
  await expect(picker(A).locator('div.grid > button')).toHaveCount(aCount)
  await expect(picker(A).locator(`img[src="/media/${bMedia}"]`)).toHaveCount(0)
  await A.keyboard.press('Escape')

  // savePost with B's mediaId → rejected.
  const isSave = (a: unknown[]) => (a[0] as { kind?: string })?.kind === 'SOCIAL'
  await rewriteAction(A, isSave, (a) => [{ ...(a[0] as object), mediaIds: [bMedia] }])
  await A.getByPlaceholder('What do you want to share?').fill('A tries to steal media')
  await A.getByRole('button', { name: 'Save draft' }).click()
  await expect(A.getByText('Some images are not available')).toBeVisible()
  await A.unroute('**/*')
  expect(sql(`select count(*) from "Post" where content='A tries to steal media' and "workspaceId"='${workspaceIdOf(emailA)}'`)).toBe('0')

  // savePost with B's post id → "Post not found", B's post unchanged.
  await rewriteAction(A, isSave, (a) => [{ ...(a[0] as object), id: bPost }])
  await A.getByRole('button', { name: 'Save draft' }).click()
  await expect(A.getByText('Post not found')).toBeVisible()
  await A.unroute('**/*')
  expect(sql(`select content from "Post" where id='${bPost}'`)).toBe('B private post')

  // deletePost(B's id) from A → no effect.
  await A.getByRole('button', { name: 'Save draft' }).click()
  await expect(A).toHaveURL(/\/app\/posts\/c/)
  const aPost = A.url().split('/').pop()!
  await rewriteAction(A, (a) => a.length === 1 && a[0] === aPost, () => [bPost])
  onceAppDialog(A, (d) => d.accept())
  await A.getByRole('button', { name: 'Delete' }).click()
  await expect(A).toHaveURL(/\/app\/planner$/)
  await A.unroute('**/*')
  expect(sql(`select count(*) from "Post" where id='${bPost}'`)).toBe('1')

  // Hashtag library: edit / delete of B's library from A → no effect.
  await A.goto('/app/create')
  await A.locator('main span.cursor-pointer').filter({ hasText: /^Hashtags/ }).click()
  await A.locator('div.absolute.z-40').getByRole('button', { name: 'Create new' }).click()
  const modal = A.getByRole('dialog', { name: 'New hashtag library' })
  await modal.getByPlaceholder('e.g. Brand basics').fill('A lib')
  await modal.locator('textarea').fill('#mine')
  await rewriteAction(A, (a) => (a[0] as { name?: string })?.name === 'A lib', (a) => [{ ...(a[0] as object), id: libB, name: 'pwned' }])
  await modal.getByRole('button', { name: 'Save library' }).click()
  await expect(modal.getByText('Library not found')).toBeVisible()
  await A.unroute('**/*')
  expect(sql(`select name || ':' || array_to_string(tags,',') from "HashtagLibrary" where id='${libB}'`)).toBe('B lib:secret')
  await modal.getByRole('button', { name: 'Save library' }).click()
  await expect(modal).toHaveCount(0)
  await A.locator('main span.cursor-pointer').filter({ hasText: /^Hashtags/ }).click()
  await A.locator('div.absolute.z-40').getByRole('button', { name: 'Manage' }).click()
  const manage = A.getByRole('dialog', { name: 'Hashtag libraries' })
  const aLib = sql(`select id from "HashtagLibrary" where "workspaceId"='${workspaceIdOf(emailA)}' and name='A lib'`)
  await rewriteAction(A, (a) => a.length === 1 && a[0] === aLib, () => [libB])
  await manage.getByRole('button', { name: 'Delete A lib' }).click()
  await A.waitForTimeout(1500)
  await A.unroute('**/*')
  expect(sql(`select count(*) from "HashtagLibrary" where id='${libB}'`)).toBe('1')
})
