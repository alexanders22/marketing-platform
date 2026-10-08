import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { newAccount, sql, onceAppDialog } from './helpers'

// Bio pages: editor, public page, click tracking, stats and security.
// One account is shared by the whole file (serial) to keep it fast.

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const stamp = Date.now().toString(36)
const BRAND = `QA Bio ${stamp}`
const BASE_SLUG = `qa-bio-${stamp}`

let ctx: BrowserContext
let page: Page
let email: string
let workspaceId: string
let pageA: string // id of first bio page
let slugA: string

const esc = (s: string) => s.replace(/'/g, "''")
const blocksEl = (p: Page) => p.locator('section:has(> h2:text-is("Links & blocks")) > div.space-y-3 > div')
const preview = (p: Page) => p.locator('aside:has(> p:text-is("Preview"))')
const errorBox = (p: Page) => p.locator('p.bg-red-50')
const slugInput = (p: Page) => p.locator('label:has-text("Page address") input')

async function save(p: Page) {
  await p.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(p.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
}

async function expectSaved(p: Page) {
  await save(p)
  await expect(errorBox(p)).toHaveCount(0)
  await expect(p.getByText(/^Saved/)).toBeVisible()
}

async function expectSaveError(p: Page, msg: string | RegExp) {
  await save(p)
  await expect(errorBox(p)).toContainText(msg)
}

const row = (id: string) => {
  const r = sql(`select slug||'|'||title||'|'||published||'|'||views from "BioPage" where id='${id}'`).split('|')
  return { slug: r[0], title: r[1], published: r[2] === 't' || r[2] === 'true', views: Number(r[3]) }
}
const blocksOf = (id: string) => JSON.parse(sql(`select blocks::text from "BioPage" where id='${id}'`)) as Record<string, unknown>[]

async function anon(browser: Browser) {
  const c = await browser.newContext()
  return { c, p: await c.newPage() }
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  page = await ctx.newPage()
  ;({ email } = await newAccount(page, 'qa-bio', BRAND))
  workspaceId = sql(
    `select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}'`,
  )
  // Brand details the new bio page should be prefilled from.
  sql(
    `insert into "BrandKit"(id,"workspaceId",website,description,colors,"socialLinks","fonts","updatedAt") values ('bk_${stamp}','${workspaceId}','https://example.com','We make QA things.',ARRAY['#123456','#654321'],ARRAY['https://instagram.com/qabio','https://x.com/qabio'],'{}',now()) on conflict ("workspaceId") do update set website=excluded.website, description=excluded.description, colors=excluded.colors, "socialLinks"=excluded."socialLinks"`,
  )
})

test.afterAll(async () => {
  await ctx?.close()
})

test('bio: new page gets unique brand slug and is prefilled from the brand', async () => {
  await page.goto('/app/bio')
  await expect(page.getByText('No bio pages yet')).toBeVisible()
  await page.getByRole('button', { name: 'New bio page' }).first().click()
  await page.waitForURL(/\/app\/bio\/[a-z0-9]+$/)
  pageA = page.url().split('/').pop()!
  await expect(slugInput(page)).toHaveValue(BASE_SLUG)
  slugA = BASE_SLUG
  await expect(page.locator('label:has(> span:text-is("Title")) input')).toHaveValue(BRAND)
  await expect(page.locator('label:has(> span:text-is("Bio")) textarea')).toHaveValue('We make QA things.')
  const blocks = blocksOf(pageA)
  expect(blocks.map((b) => b.type)).toEqual(['link', 'socials'])
  expect(blocks[0]).toMatchObject({ title: 'Visit our website', url: 'https://example.com', enabled: true })
  expect(blocks[1]).toMatchObject({ links: ['https://instagram.com/qabio', 'https://x.com/qabio'] })
  // Brand preset uses the brand primary colour.
  expect(JSON.parse(sql(`select theme::text from "BioPage" where id='${pageA}'`)).background).toBe('#123456')

  await page.goto('/app/bio')
  await page.getByRole('button', { name: 'New bio page' }).first().click()
  await page.waitForURL((u) => /\/app\/bio\/[a-z0-9]+$/.test(u.pathname) && !u.pathname.endsWith(pageA))
  await expect(slugInput(page)).toHaveValue(`${BASE_SLUG}-2`)
  expect(sql(`select count(distinct slug) from "BioPage" where "workspaceId"='${workspaceId}'`)).toBe('2')
})

test('bio: blocks can be added, edited, reordered, hidden and deleted', async () => {
  await page.goto(`/app/bio/${pageA}`)
  const blocks = blocksEl(page)
  await expect(blocks).toHaveCount(2)
  for (const name of ['Link', 'Heading', 'Text', 'Social icons']) {
    await page.locator('section:has(> h2:text-is("Links & blocks")) > div.mt-3 button', { hasText: name }).click()
  }
  await expect(blocks).toHaveCount(6)
  // edit new link
  const link = blocks.nth(2)
  await link.getByPlaceholder('Button text').fill('Shop now')
  await link.getByPlaceholder('https://').fill('https://shop.example.com/sale')
  await blocks.nth(3).locator('textarea').fill('Our offers')
  await blocks.nth(4).locator('textarea').fill('Hello visitors')
  await blocks.nth(5).getByRole('button', { name: '+ Add social link' }).click()
  await blocks.nth(5).getByPlaceholder('https://instagram.com/yourbrand').fill('https://tiktok.com/@qabio')
  await expect(preview(page).getByRole('link', { name: 'Shop now' })).toBeVisible()
  await expect(preview(page).getByText('Our offers')).toBeVisible()

  // move heading (index 3) up to index 2
  await blocks.nth(3).getByRole('button', { name: 'Move up' }).click()
  await expect(blocks.nth(2).locator('textarea')).toHaveValue('Our offers')
  // move first up is a no-op, last down is a no-op
  await blocks.nth(0).getByRole('button', { name: 'Move up' }).click()
  await blocks.nth(5).getByRole('button', { name: 'Move down' }).click()
  await expect(blocks).toHaveCount(6)

  // hide the text block -> disappears from preview
  await blocks.nth(4).getByRole('button', { name: 'Hide' }).click()
  await expect(blocks.nth(4).getByRole('button', { name: 'Show' })).toBeVisible()
  await expect(preview(page).getByText('Hello visitors')).toHaveCount(0)

  // delete the website link block
  await blocks.nth(0).getByRole('button', { name: 'Delete' }).click()
  await expect(blocks).toHaveCount(5)
  await expectSaved(page)

  const saved = blocksOf(pageA)
  expect(saved.map((b) => b.type)).toEqual(['socials', 'heading', 'link', 'text', 'socials'])
  expect(saved[3]).toMatchObject({ text: 'Hello visitors', enabled: false })
  expect(saved[2]).toMatchObject({ title: 'Shop now', url: 'https://shop.example.com/sale', enabled: true })
  // persists over reload
  await page.reload()
  await expect(blocksEl(page)).toHaveCount(5)
})

test('bio: theme presets, custom colours, button style and corners drive the preview', async () => {
  await page.goto(`/app/bio/${pageA}`)
  const root = preview(page).locator('div.min-h-full').first()
  const btn = preview(page).getByRole('link', { name: 'Shop now' })

  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(root).toHaveCSS('background-color', 'rgb(17, 17, 17)')
  await expect(btn).toHaveCSS('border-top-style', 'solid') // outline style

  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(root).toHaveCSS('background-color', 'rgb(247, 247, 245)')
  await expect(btn).toHaveCSS('background-color', 'rgb(18, 52, 86)') // brand primary #123456

  await page.locator('label:has-text("Background") input[type=color]').fill('#ff0000')
  await expect(root).toHaveCSS('background-color', 'rgb(255, 0, 0)')
  await page.locator('label:text-is("Button") input[type=color]').fill('#00ff00')
  await expect(btn).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  await page.locator('label:has-text("Button text") input[type=color]').fill('#0000ff')
  await expect(btn).toHaveCSS('color', 'rgb(0, 0, 255)')

  await page.getByRole('button', { name: 'outline', exact: true }).click()
  await expect(btn).toHaveCSS('border-top-color', 'rgb(0, 255, 0)')
  await page.getByRole('button', { name: 'soft', exact: true }).click()
  await expect(btn).toHaveCSS('background-color', 'rgba(0, 255, 0, 0.15)')
  await page.getByRole('button', { name: 'none', exact: true }).click()
  await expect(btn).toHaveCSS('border-top-left-radius', '0px')
  await page.getByRole('button', { name: 'Rounded', exact: true }).click()
  await expect(btn).toHaveCSS('border-top-left-radius', '12px')
  await page.getByRole('button', { name: 'full', exact: true }).click()
  await expect(btn).toHaveCSS('border-top-left-radius', '999px')
  await expectSaved(page)
  expect(JSON.parse(sql(`select theme::text from "BioPage" where id='${pageA}'`))).toMatchObject({
    background: '#ff0000',
    button: '#00ff00',
    buttonText: '#0000ff',
    buttonStyle: 'soft',
    rounded: 'full',
  })
})

test('bio: avatar upload via media picker', async () => {
  await page.goto(`/app/bio/${pageA}`)
  await page.getByRole('button', { name: 'Add avatar' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add images' })
  await expect(dialog).toBeVisible()
  await dialog.locator('input[type=file]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: PNG })
  await expect(dialog.getByRole('button', { name: 'Add 1 image' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Add 1 image' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toBeVisible()
  await expect(preview(page).locator('img')).toHaveAttribute('src', /^\/media\//)
  await expectSaved(page)
  expect(sql(`select "avatarMediaId" is not null from "BioPage" where id='${pageA}'`)).toBe('t')
})

test('bio: slug validation', async () => {
  await page.goto(`/app/bio/${pageA}`)
  const s = slugInput(page)
  await s.fill('ab')
  await expectSaveError(page, 'Use 3–40 letters, digits or dashes')
  await s.fill('bad_slug!')
  await expectSaveError(page, 'Use 3–40 letters, digits or dashes')
  await s.fill('-dash-start')
  await expectSaveError(page, 'Use 3–40 letters, digits or dashes')
  await s.fill('a'.repeat(41))
  await expectSaveError(page, 'Use 3–40 letters, digits or dashes')
  for (const r of ['app', 'admin', 'api', 'login']) {
    await s.fill(r)
    await expectSaveError(page, 'This address is reserved')
  }
  await s.fill(`${BASE_SLUG}-2`) // other page's slug
  await expectSaveError(page, 'This address is already taken')
  // uppercase converted to lowercase in the field and in the DB
  await s.fill(`QA-Bio-${stamp}-Main`)
  await expect(s).toHaveValue(`qa-bio-${stamp}-main`)
  await expectSaved(page)
  slugA = `qa-bio-${stamp}-main`
  expect(row(pageA).slug).toBe(slugA)
})

test('bio: link URL validation', async () => {
  await page.goto(`/app/bio/${pageA}`)
  const link = blocksEl(page).filter({ has: page.getByPlaceholder('Button text') }).first()
  const url = link.getByPlaceholder('https://')
  for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://example.com/x', 'example.com', 'https://', 'JAVASCRIPT://example.com/%0aalert(1)']) {
    await url.fill(bad)
    await expectSaveError(page, 'Links must start with https://, mailto: or tel:')
  }
  for (const good of ['mailto:hi@example.com', 'tel:+995 555 12 34', 'http://example.com', 'https://shop.example.com/sale']) {
    await url.fill(good)
    await expectSaved(page)
  }
  // social icon links validated too
  const social = blocksEl(page).filter({ has: page.getByPlaceholder('https://instagram.com/yourbrand') }).last()
  await social.getByPlaceholder('https://instagram.com/yourbrand').last().fill('javascript:alert(1)')
  await expectSaveError(page, 'Links must start with https://, mailto: or tel:')
  await social.getByPlaceholder('https://instagram.com/yourbrand').last().fill('https://tiktok.com/@qabio')
  // empty title rejected
  await link.getByPlaceholder('Button text').fill('   ')
  await expectSaveError(page, 'Every link needs a title')
  await link.getByPlaceholder('Button text').fill('Shop now')
  await expectSaved(page)
})

test('bio: publish, copy link, public page renders without session; unpublish -> 404', async ({ browser }) => {
  await page.goto(`/app/bio/${pageA}`)
  // XSS payloads in title / bio / heading / link title
  await page.locator('label:has(> span:text-is("Title")) input').fill(`<script>window.__x=1</script>"Q'A <b>bold</b>`)
  await page.locator('label:has(> span:text-is("Bio")) textarea').fill(`<img src=x onerror="window.__y=1"> bio "quoted"`)
  await blocksEl(page).nth(1).locator('textarea').fill('<h1>head</h1>')
  await blocksEl(page).filter({ has: page.getByPlaceholder('Button text') }).first().getByPlaceholder('Button text').fill('<a href="javascript:alert(1)">Shop</a>')
  await expectSaved(page)
  await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(0) // only when published
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible()
  await expect(page.getByText('Saved — your page is live.')).toBeVisible()
  expect(row(pageA).published).toBe(true)

  await page.getByRole('button', { name: 'Copy link' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://localhost:3100/b/${slugA}`)
  await expect(page.getByRole('link', { name: 'Open' })).toHaveAttribute('href', `/b/${slugA}`)

  const { c, p } = await anon(browser)
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(e.message))
  let dialogs = 0
  p.on('dialog', (d) => {
    dialogs++
    d.dismiss()
  })
  const res = await p.goto(`/b/${slugA}`)
  expect(res?.status()).toBe(200)
  await expect(p.getByRole('heading', { level: 1 })).toHaveText(`<script>window.__x=1</script>"Q'A <b>bold</b>`)
  await expect(p.getByText(`<img src=x onerror="window.__y=1"> bio "quoted"`)).toBeVisible()
  await expect(p.getByText('<h1>head</h1>')).toBeVisible()
  await expect(p.getByRole('link', { name: '<a href="javascript:alert(1)">Shop</a>' })).toBeVisible()
  expect(await p.evaluate(() => { const w = window as unknown as Record<string, unknown>; return [w.__x, w.__y] })).toEqual([undefined, undefined])
  expect(await p.locator('h1 b, img[src=x]').count()).toBe(0)
  expect(dialogs).toBe(0)
  // theme colours
  await expect(p.locator('div.min-h-full').first()).toHaveCSS('background-color', 'rgb(255, 0, 0)')
  // hidden text block not rendered
  await expect(p.getByText('Hello visitors')).toHaveCount(0)
  // avatar served through public route
  const img = p.locator('img').first()
  await expect(img).toHaveAttribute('src', `/b/${slugA}/avatar`)
  expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  // links go through the click tracker
  await expect(p.getByRole('link', { name: '<a href="javascript:alert(1)">Shop</a>' })).toHaveAttribute('href', new RegExp(`^/b/${slugA}/go/`))
  // title tag
  expect(await p.title()).toContain('<script>')
  expect(errors).toEqual([])

  // hidden blocks and internal ids must not leak into the HTML / RSC payload
  const html = await (await c.request.get(`/b/${slugA}`)).text()
  expect(html).not.toContain('Hello visitors')
  expect(html).not.toContain(workspaceId)

  // Uppercase slug in URL also works
  expect((await p.goto(`/b/${slugA.toUpperCase()}`))?.status()).toBe(200)

  // unpublish -> 404 for visitors
  await page.getByRole('button', { name: 'Unpublish' }).click()
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible()
  expect(row(pageA).published).toBe(false)
  expect((await p.goto(`/b/${slugA}`))?.status()).toBe(404)
  expect((await c.request.get(`/b/${slugA}/avatar`)).status()).toBe(404)
  // never-published second page -> 404
  expect((await p.goto(`/b/${BASE_SLUG}-2`))?.status()).toBe(404)
  expect((await p.goto(`/b/does-not-exist-${stamp}`))?.status()).toBe(404)
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible()
  await c.close()
})

test('bio: views counter increments once per public load', async ({ browser }) => {
  const { c, p } = await anon(browser)
  const before = row(pageA).views
  await p.goto(`/b/${slugA}`)
  await p.waitForLoadState('networkidle')
  expect(row(pageA).views).toBe(before + 1)
  await p.reload()
  await p.waitForLoadState('networkidle')
  expect(row(pageA).views).toBe(before + 2)
  // editor preview does not count
  await page.goto(`/app/bio/${pageA}`)
  await page.waitForLoadState('networkidle')
  expect(row(pageA).views).toBe(before + 2)
  await c.close()
})

test('bio: go/[blockId] counts the click and redirects only to the stored URL', async ({ browser }) => {
  const { c } = await anon(browser)
  const blocks = blocksOf(pageA)
  const link = blocks.find((b) => b.type === 'link')!
  const hidden = blocks.find((b) => b.enabled === false)!
  const heading = blocks.find((b) => b.type === 'heading')!
  const clicks = () => Number(sql(`select count(*) from "BioClick" where "pageId"='${pageA}'`))
  const before = clicks()

  const r = await c.request.get(`/b/${slugA}/go/${link.id}`, { maxRedirects: 0 })
  expect(r.status()).toBe(302)
  expect(r.headers()['location']).toBe('https://shop.example.com/sale')
  expect(clicks()).toBe(before + 1)

  // query string can't override target
  const r2 = await c.request.get(`/b/${slugA}/go/${link.id}?url=https://evil.example&next=//evil.example`, { maxRedirects: 0 })
  expect(r2.headers()['location']).toBe('https://shop.example.com/sale')
  expect(clicks()).toBe(before + 2)

  for (const id of ['nope', hidden.id, heading.id]) {
    const x = await c.request.get(`/b/${slugA}/go/${id}`, { maxRedirects: 0 })
    expect([302, 307, 308]).toContain(x.status())
    expect(new URL(x.headers()['location'], 'http://localhost:3100').pathname).toBe(`/b/${slugA}`)
  }
  expect(clicks()).toBe(before + 2)

  // unknown slug / encoded slashes stay on our origin
  const x = await c.request.get(`/b/%2F%2Fevil.example/go/abc`, { maxRedirects: 0 })
  expect(new URL(x.headers()['location'] ?? '/', 'http://localhost:3100').host).toBe('localhost:3100')

  // unpublished page link doesn't count or redirect out
  const other = sql(`select id from "BioPage" where slug='${BASE_SLUG}-2'`)
  const otherLink = blocksOf(other).find((b) => b.type === 'link')!
  const y = await c.request.get(`/b/${BASE_SLUG}-2/go/${otherLink.id}`, { maxRedirects: 0 })
  expect(new URL(y.headers()['location'], 'http://localhost:3100').pathname).toBe(`/b/${BASE_SLUG}-2`)
  expect(sql(`select count(*) from "BioClick" where "pageId"='${other}'`)).toBe('0')
  await c.close()
})

test('bio: avatar route exposes only a published page avatar, never other media', async ({ browser }) => {
  const { c } = await anon(browser)
  const ok = await c.request.get(`/b/${slugA}/avatar`)
  expect(ok.status()).toBe(200)
  expect(ok.headers()['content-type']).toMatch(/^image\//)

  // another private media in the same workspace
  const avatarId = sql(`select "avatarMediaId" from "BioPage" where id='${pageA}'`)
  const otherMedia = sql(
    `insert into "Media"(id,"workspaceId",mime,path,bytes) select 'qa_priv_${stamp}', "workspaceId", mime, path, bytes from "Media" where id='${avatarId}' returning id`,
  ).split('\n')[0]
  for (const u of [
    `/b/${slugA}/avatar?id=${otherMedia}`,
    `/b/${slugA}/avatar/${otherMedia}`,
    `/media/${otherMedia}`,
    `/media/${avatarId}`,
    `/b/${BASE_SLUG}-2/avatar`,
    `/b/nonexistent-${stamp}/avatar`,
  ]) {
    const r = await c.request.get(u, { maxRedirects: 0 })
    if (u.includes('?id=')) {
      // must still be the page's own avatar, not the requested media
      expect(r.status()).toBe(200)
      continue
    }
    expect(r.status(), u).toBe(404)
  }
  sql(`delete from "Media" where id='${otherMedia}'`)
  await c.close()
})

test('bio: other accounts cannot open or see this page in the editor', async ({ browser }) => {
  const c = await browser.newContext()
  const p = await c.newPage()
  await newAccount(p, 'qa-bio', `QA Bio Other ${stamp}`)
  expect((await p.goto(`/app/bio/${pageA}`))?.status()).toBe(404)
  await p.goto('/app/bio')
  await expect(p.getByText('No bio pages yet')).toBeVisible()
  await c.close()
})

test('bio: stats in editor and list match the DB', async () => {
  const { views } = row(pageA)
  const per = sql(`select "blockId"||':'||count(*) from "BioClick" where "pageId"='${pageA}' group by "blockId"`)
    .split('\n')
    .filter(Boolean)
  const total = per.reduce((a, l) => a + Number(l.split(':')[1]), 0)
  expect(total).toBeGreaterThan(0)
  await page.goto(`/app/bio/${pageA}`)
  const head = page.locator('div.mr-auto > h1 + p')
  await expect(head).toContainText(`${views.toLocaleString()} views`)
  await expect(head).toContainText(`${total.toLocaleString()} clicks`)
  const linkBlock = blocksEl(page).filter({ has: page.getByPlaceholder('Button text') }).first()
  await expect(linkBlock).toContainText(`${total} clicks`)

  await page.goto('/app/bio')
  const card = page.locator(`a[href="/app/bio/${pageA}"]`)
  await expect(card).toContainText(`${views.toLocaleString()} views`)
  await expect(card).toContainText(`${total.toLocaleString()} clicks`)
  await expect(card).toContainText('Live')
  await expect(card).toContainText(`/b/${slugA}`)
  await expect(page.locator(`a[href^="/app/bio/"]`, { hasText: 'Draft' })).toHaveCount(1)
})

test('bio: delete page', async ({ browser }) => {
  await page.goto(`/app/bio/${pageA}`)
  onceAppDialog(page, (d) => d.accept())
  await page.getByRole('button', { name: 'Delete page' }).click()
  await page.waitForURL(/\/app\/bio$/)
  await expect(page.locator(`a[href="/app/bio/${pageA}"]`)).toHaveCount(0)
  expect(sql(`select count(*) from "BioPage" where id='${pageA}'`)).toBe('0')
  expect(sql(`select count(*) from "BioClick" where "pageId"='${pageA}'`)).toBe('0')
  const { c, p } = await anon(browser)
  expect((await p.goto(`/b/${slugA}`))?.status()).toBe(404)
  await c.close()
})

// Pages created by "New bio page" for unusual brand names must be savable as-is.
test('bio: auto-created page saves without edits for long / reserved / cut-at-dash brand names', async () => {
  const taken = sql(`select slug from "BioPage"`).split('\n')
  const word = ['admin', 'login', 'signup', 'support', 'help', 'media', 'auth', 'khma', 'api', 'app'].find((w) => !taken.includes(w))
  const cases = [
    // brand-schema allows 120-char names; bio title max is 80
    { label: 'long name (>80 chars)', name: `QA Bio ${stamp} ` + 'Long Brand Name '.repeat(7) },
    // slug base is cut at 30 chars; here char 30 is a dash -> slug ends with "-"
    { label: 'slug cut ends with dash', name: `QA trailing dash ${stamp} xxxxxxxxxxxxxxxxxxxxxxxx`.replace(/^(.{29}).*$/, '$1 yy') },
    ...(word ? [{ label: `reserved word "${word}"`, name: word }] : []),
  ]
  for (const c of cases) {
    sql(`update "Workspace" set name='${esc(c.name.trim())}' where id='${workspaceId}'`)
    await page.goto('/app/bio')
    await page.getByRole('button', { name: 'New bio page' }).first().click()
    await page.waitForURL((u) => /\/app\/bio\/[a-z0-9]+$/.test(u.pathname))
    const id = page.url().split('/').pop()!
    const slug = await slugInput(page).inputValue()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(errorBox(page).or(page.getByText(/^Saved/))).toBeVisible()
    const err = (await errorBox(page).count()) ? await errorBox(page).textContent() : null
    sql(`delete from "BioPage" where id='${id}'`)
    expect.soft(err, `${c.label}: generated slug "${slug}" -> save error "${err}"`).toBeNull()
  }
  sql(`update "Workspace" set name='${esc(BRAND)}' where id='${workspaceId}'`)
})
