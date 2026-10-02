import { expect, test, type Browser, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { newAccount, sql } from './helpers'

// Design Studio QA part 2: workspace isolation, crafted server-action
// payloads (image layers, foreign ids), edge cases, narrow viewports.

const workspaceOf = (email: string) =>
  sql(
    `select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}' order by w."createdAt" limit 1`,
  )
type L = { id: string; type: string; name: string; x: number; y: number; w: number; h: number; [k: string]: unknown }
const design = (id: string) => {
  const r = sql(`select json_build_object('name',name,'width',width,'height',height,'data',data) from "Design" where id='${id}'`)
  return r ? (JSON.parse(r) as { name: string; width: number; height: number; data: { background: string; layers: L[] } }) : null
}
const idFromUrl = (p: Page) => p.url().split('/').pop()!.split('?')[0]
const canvas = (p: Page) => p.locator('div.relative.shadow-xl')
const layerEls = (p: Page) => canvas(p).locator('> div.absolute.inset-0 > div')
const status = (p: Page) => p.getByText(/^(All changes saved|Unsaved changes|Saving…|Not saved)$/)
const num = (p: Page, k: 'X' | 'Y' | 'W' | 'H') => p.locator('aside label').filter({ hasText: new RegExp(`^${k}$`) }).locator('input')
const prop = (p: Page, label: RegExp) => p.locator('aside div.mt-4').filter({ has: p.locator('p', { hasText: label }) }).first()
const waitSaved = (p: Page) => expect(status(p)).toHaveText('All changes saved', { timeout: 15_000 })
async function settle(p: Page) {
  // Wait until the editor stops saving and report the final status.
  await expect(status(p)).not.toHaveText(/Unsaved changes|Saving…/, { timeout: 20_000 })
  return status(p).innerText()
}
async function newDesign(p: Page, template = 'Blank', size = 'Instagram post') {
  await p.goto('/app/studio')
  await p.getByRole('button', { name: new RegExp(`^${size.replace('/', '\\/')} `) }).click()
  await p.locator('main button').filter({ has: p.locator('p', { hasText: new RegExp(`^${template}$`) }) }).click()
  await p.waitForURL(/\/app\/studio\/[a-z0-9]{20,}$/)
  await expect(canvas(p)).toBeVisible()
  return idFromUrl(p)
}
async function selectLayer(p: Page, i: number) {
  const b = (await layerEls(p).nth(i).boundingBox())!
  await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
}
async function downloadPng(p: Page) {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15_000 }), p.getByRole('button', { name: 'Download PNG' }).click()])
  return readFileSync((await dl.path())!)
}
const pngSize = (b: Buffer) => ({ sig: b.subarray(0, 8).toString('hex'), w: b.readUInt32BE(16), h: b.readUInt32BE(20) })
async function pixel(p: Page, png: Buffer, x: number, y: number) {
  return p.evaluate(
    async ({ b64, x, y }) => {
      const i = new Image()
      await new Promise((r) => ((i.onload = r), (i.src = `data:image/png;base64,${b64}`)))
      const c = document.createElement('canvas')
      c.width = i.width
      c.height = i.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(i, 0, 0)
      return Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3))
    },
    { b64: png.toString('base64'), x, y },
  )
}
async function allWhite(p: Page, png: Buffer) {
  return p.evaluate(async (b64) => {
    const i = new Image()
    await new Promise((r) => ((i.onload = r), (i.src = `data:image/png;base64,${b64}`)))
    const c = document.createElement('canvas')
    c.width = i.width
    c.height = i.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(i, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    for (let k = 0; k < d.length; k++) if (d[k] !== 255) return false
    return true
  }, png.toString('base64'))
}
// Rewrites the body of the next server-action POST whose body matches.
async function rewriteNextAction(p: Page, match: (body: string) => boolean, rewrite: (body: string) => string) {
  const state = { done: false }
  await p.route('**/app/studio**', async (route) => {
    const req = route.request()
    const body = req.postData() ?? ''
    if (!state.done && req.method() === 'POST' && req.headers()['next-action'] && match(body)) {
      state.done = true
      await route.continue({ postData: rewrite(body) })
    } else await route.continue()
  })
  return state
}
const fakeMedia = (workspaceId: string) => {
  const id = `qamedia${Date.now()}${Math.floor(Math.random() * 1e6)}`
  sql(`insert into "Media"(id,"workspaceId",mime,path,bytes) values('${id}','${workspaceId}','image/png','${workspaceId}/qa-none.png',10)`)
  return id
}

let A: Page
let B: Page
let wsA: string
let wsB: string
let current = ''
const problems: { test: string; kind: string; text: string }[] = []
function watch(p: Page, who: string) {
  p.on('console', (m) => m.type() === 'error' && problems.push({ test: current, kind: `${who} console`, text: m.text().slice(0, 300) }))
  p.on('pageerror', (e) => problems.push({ test: current, kind: `${who} pageerror`, text: String(e).slice(0, 300) }))
  p.on('response', (r) => r.status() >= 500 && problems.push({ test: current, kind: `${who} HTTP ${r.status()}`, text: r.url() }))
}
async function boot(browser: Browser) {
  A = await (await browser.newContext({ acceptDownloads: true })).newPage()
  B = await (await browser.newContext({ acceptDownloads: true })).newPage()
  watch(A, 'A')
  watch(B, 'B')
  wsA = workspaceOf((await newAccount(A, 'qa-studio')).email)
  wsB = workspaceOf((await newAccount(B, 'qa-studio')).email)
}
test.beforeAll(async ({ browser }) => boot(browser))
test.beforeEach(async ({}, info) => {
  current = info.title
  for (const p of [A, B]) {
    await p.unrouteAll({ behavior: 'ignoreErrors' })
    await p.setViewportSize({ width: 1360, height: 900 })
  }
})
test.afterEach(async ({}, info) => {
  const mine = problems.filter((p) => p.test === info.title)
  if (mine.length) console.log(`[${info.title}] console/5xx:\n  ` + mine.map((p) => `${p.kind}: ${p.text}`).join('\n  '))
  expect.soft(mine.filter((p) => p.kind.includes('HTTP')), '5xx responses').toEqual([])
})

// ─── 8. Isolation ───────────────────────────────────────────────────────
test.describe('isolation', () => {
  test("second account cannot open, list, save, export, duplicate or delete the first account's design", async () => {
    const aId = await newDesign(A, 'Sale announcement')
    const aBefore = sql(`select data::text||name from "Design" where id='${aId}'`)

    const res = await B.goto(`/app/studio/${aId}`)
    expect(res!.status()).toBe(404)
    await expect(canvas(B)).toHaveCount(0)
    await B.goto('/app/studio')
    await expect(B.locator(`a[href="/app/studio/${aId}"]`)).toHaveCount(0)

    // saveDesign with A's id (B edits own design; request rewritten).
    const bId = await newDesign(B, 'Blank')
    let st = await rewriteNextAction(B, (b) => b.includes(`"id":"${bId}"`), (b) => b.replaceAll(bId, aId))
    await B.getByRole('button', { name: 'Add rectangle' }).click()
    expect(await settle(B)).toBe('Not saved')
    expect(st.done).toBe(true)
    await expect(B.getByText('Design not found')).toBeVisible()
    expect(sql(`select data::text||name from "Design" where id='${aId}'`)).toBe(aBefore)

    // exportDesign with A's id.
    await B.unrouteAll({ behavior: 'ignoreErrors' })
    const postsB = sql(`select count(*) from "Post" where "workspaceId"='${wsB}'`)
    st = await rewriteNextAction(B, (b) => b.startsWith(`["${bId}"`), (b) => b.replace(bId, aId))
    await B.getByRole('button', { name: 'Use in post' }).click()
    await expect(B.getByText('Design not found')).toBeVisible()
    expect(st.done).toBe(true)
    expect(sql(`select count(*) from "Post" where "workspaceId"='${wsB}'`)).toBe(postsB)
    expect(sql(`select coalesce("previewMediaId",'') from "Design" where id='${aId}'`)).toBe('')

    // duplicate / delete from B's gallery with A's id.
    await B.unrouteAll({ behavior: 'ignoreErrors' })
    await B.goto('/app/studio')
    const card = B.locator('div.group.relative').filter({ has: B.locator(`a[href="/app/studio/${bId}"]`) })
    st = await rewriteNextAction(B, (b) => b === `["${bId}"]`, () => `["${aId}"]`)
    await card.hover()
    await card.getByRole('button', { name: 'Duplicate' }).click()
    await B.waitForTimeout(1500)
    expect(st.done).toBe(true)
    expect(sql(`select count(*) from "Design" where name like '%(copy)' and "workspaceId" in ('${wsA}','${wsB}')`)).toBe('0')
    await B.unrouteAll({ behavior: 'ignoreErrors' })
    st = await rewriteNextAction(B, (b) => b === `["${bId}"]`, () => `["${aId}"]`)
    B.once('dialog', (d) => d.accept())
    await card.hover()
    await card.getByRole('button', { name: 'Delete' }).click()
    await B.waitForTimeout(1500)
    expect(st.done).toBe(true)
    expect(design(aId)).not.toBeNull()
  })
})

// ─── 5b. saveDesign image validation (crafted payloads) ─────────────────
test.describe('image layer validation', () => {
  const imageLayer = (mediaId: string, src: string) => ({
    id: 'qaimg1', type: 'image', name: 'Image', x: 0, y: 0, w: 300, h: 300, rotation: 0, mediaId, src, fit: 'cover', radius: 0, opacity: 1,
  })
  async function crafted(layer: object) {
    const id = await newDesign(B, 'Blank')
    const st = await rewriteNextAction(
      B,
      (b) => b.includes(`"id":"${id}"`),
      (b) => {
        const args = JSON.parse(b)
        args[0].data.layers.push(layer)
        return JSON.stringify(args)
      },
    )
    await B.getByRole('button', { name: 'Add rectangle' }).click()
    const final = await settle(B)
    expect(st.done).toBe(true)
    return { id, final }
  }

  test("rejects an image layer pointing at another workspace's media", async () => {
    const foreign = fakeMedia(wsA)
    const { id, final } = await crafted(imageLayer(foreign, `/media/${foreign}`))
    expect(final).toBe('Not saved')
    await expect(B.getByText('Some images are not available')).toBeVisible()
    expect(design(id)!.data.layers).toHaveLength(0)
    // and B cannot fetch A's media directly
    const r = await B.request.get(`/media/${foreign}`)
    expect(r.status()).toBeGreaterThanOrEqual(400)
    expect(r.status()).toBeLessThan(500)
  })

  test('rejects an image layer with an arbitrary URL', async () => {
    const own = fakeMedia(wsB)
    for (const src of ['https://evil.example/x.png', `/media/${own}?x=1`, `//evil.example/media/${own}`, `/media/../api/x`]) {
      const { id, final } = await crafted(imageLayer(own, src))
      expect(final, src).toBe('Not saved')
      expect(design(id)!.data.layers, src).toHaveLength(0)
    }
  })

  test('rejects own mediaId paired with a src of a different media', async () => {
    const own = fakeMedia(wsB)
    const foreign = fakeMedia(wsA)
    const { id, final } = await crafted(imageLayer(own, `/media/${foreign}`))
    expect(final).toBe('Not saved')
    await expect(B.getByText('Invalid image')).toBeVisible()
    expect(design(id)!.data.layers).toHaveLength(0)
  })

  test('accepts own media (control)', async () => {
    const own = fakeMedia(wsB)
    const { id, final } = await crafted(imageLayer(own, `/media/${own}`))
    expect(final).toBe('All changes saved')
    expect(design(id)!.data.layers.map((l) => l.type)).toEqual(['shape', 'image'])
  })
})

// ─── 7. Edge cases ──────────────────────────────────────────────────────
test.describe('edge cases', () => {
  test('very long text (2500 chars) is saved or the limit is explained', async () => {
    const id = await newDesign(A)
    await A.getByRole('button', { name: 'Add body text' }).click()
    const long = 'Lorem ipsum dolor sit amet. '.repeat(90).slice(0, 2500)
    await prop(A, /^Text$/).locator('textarea').fill(long)
    const final = await settle(A)
    const errEl = A.locator('p.bg-red-50')
    const err = (await errEl.count()) ? await errEl.first().textContent() : null
    console.log('long text → status:', final, '| error:', err)
    // Either it is saved, or the UI tells the user what the limit is.
    if (final !== 'All changes saved') expect(err ?? '', 'error should mention the text limit').toMatch(/2[, ]?000|too long|characters/i)
    // The text field caps input at the 2,000-character limit, so it always saves.
    else expect((design(id)!.data.layers[0].text as string).length).toBe(2000)
  })

  test('long design name (130 chars) is saved or limited in the input', async () => {
    const id = await newDesign(A)
    await A.getByLabel('Design name').fill('N'.repeat(130))
    const final = await settle(A)
    const shown = await A.getByLabel('Design name').inputValue()
    console.log('long name → status:', final, 'input length', shown.length)
    expect(final).toBe('All changes saved')
    expect(design(id)!.name).toBe(shown)
  })

  test('many layers (60) save and export', async () => {
    const id = await newDesign(A)
    for (let i = 0; i < 30; i++) {
      await A.getByRole('button', { name: 'Add rectangle' }).click()
      await A.getByRole('button', { name: 'Add body text' }).click()
    }
    await expect(layerEls(A)).toHaveCount(60)
    expect(await settle(A)).toBe('All changes saved')
    expect(design(id)!.data.layers).toHaveLength(60)
    const t0 = Date.now()
    const png = await downloadPng(A)
    console.log('60-layer export ms', Date.now() - t0)
    expect(pngSize(png)).toMatchObject({ w: 1080, h: 1080 })
  })

  test('duplicating a duplicate 16× (⌘D chain) still saves', async () => {
    const id = await newDesign(A)
    await A.getByRole('button', { name: 'Add rectangle' }).click()
    await A.mouse.click(5, 895)
    await selectLayer(A, 0)
    for (let i = 0; i < 16; i++) await A.keyboard.press('ControlOrMeta+d')
    await expect(layerEls(A)).toHaveCount(17)
    const final = await settle(A)
    const errEl = A.locator('p.bg-red-50')
    const err = (await errEl.count()) ? await errEl.first().textContent() : null
    console.log('⌘D chain → status:', final, '| error:', err, '| last name length', ('Rectangle' + ' copy'.repeat(16)).length)
    expect(final).toBe('All changes saved')
    expect(design(id)!.data.layers).toHaveLength(17)
  })

  test('more than 200 layers: editor blocks it or it saves', async () => {
    const id = await newDesign(A)
    for (let i = 0; i < 201; i++) await A.getByRole('button', { name: 'Add rectangle' }).click({ delay: 0 })
    const n = await layerEls(A).count()
    const final = await settle(A)
    console.log('201 layers → shown', n, 'status', final, 'db', design(id)!.data.layers.length)
    // Silent "Not saved" with a generic error is the failure mode.
    expect(final === 'All changes saved' || n <= 200, `status=${final}, layers shown=${n}`).toBe(true)
  })

  test('empty design exports a valid all-white PNG', async () => {
    await newDesign(A, 'Blank', 'Instagram post')
    const png = await downloadPng(A)
    expect(pngSize(png)).toEqual({ sig: '89504e470d0a1a0a', w: 1080, h: 1080 })
    expect(await allWhite(A, png)).toBe(true)
  })

  test('negative positions save and export (layer partially off-canvas)', async () => {
    const id = await newDesign(A)
    await A.getByRole('button', { name: 'Add rectangle' }).click()
    await prop(A, /^Fill$/).getByRole('button', { name: 'Colour #111111' }).click()
    await num(A, 'X').fill('-200')
    await num(A, 'Y').fill('-150')
    expect(await settle(A)).toBe('All changes saved')
    expect(design(id)!.data.layers[0]).toMatchObject({ x: -200, y: -150 })
    const png = await downloadPng(A)
    expect(await pixel(A, png, 2, 2)).toEqual([17, 17, 17])
    expect(await pixel(A, png, 1000, 1000)).toEqual([255, 255, 255])
  })

  test('negative width typed into W does not break export', async () => {
    await newDesign(A)
    await A.getByRole('button', { name: 'Add rectangle' }).click()
    await num(A, 'W').fill('-100')
    const final = await settle(A)
    console.log('W=-100 → status', final, 'W shown', await num(A, 'W').inputValue())
    const png = await downloadPng(A) // throws if no download happens
    expect(pngSize(png)).toMatchObject({ w: 1080, h: 1080 })
  })

  test('1080×1920 story: canvas fits the stage, export is 1080×1920', async () => {
    await newDesign(A, 'Tip of the day', 'Story / Reel')
    const c = (await canvas(A).boundingBox())!
    const vp = A.viewportSize()!
    expect(c.y + c.height).toBeLessThanOrEqual(vp.height)
    expect(c.height).toBeGreaterThan(400)
    await expect(A.getByText(/1080×1920 · \d+%/)).toBeVisible()
    expect(pngSize(await downloadPng(A))).toMatchObject({ w: 1080, h: 1920 })
  })
})

// ─── 7b. Narrow viewports ───────────────────────────────────────────────
test.describe('narrow viewport', () => {
  for (const [w, h] of [
    [768, 1024],
    [390, 844],
  ] as const)
    test(`editor is usable at ${w}px`, async () => {
      await newDesign(A, 'Event invite', 'Instagram post')
      await A.setViewportSize({ width: w, height: h })
      await A.waitForTimeout(600)
      await A.screenshot({ path: test.info().outputPath(`editor-${w}.png`) })
      const m = await A.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))
      const c = (await canvas(A).boundingBox())!
      await selectLayer(A, 2) // title
      const panelVisible = await prop(A, /^Text$/).isVisible()
      console.log(`${w}px: scrollWidth=${m.sw} canvas=${Math.round(c.width)}×${Math.round(c.height)} (${Math.round((c.width / w) * 100)}% of width) propertiesPanel=${panelVisible}`)
      expect.soft(m.sw, 'no horizontal page scroll').toBeLessThanOrEqual(w)
      expect.soft(c.width, 'artboard should be at least 160px wide to be editable').toBeGreaterThanOrEqual(160)
      expect.soft(panelVisible, 'text properties reachable').toBe(true)
    })
})
