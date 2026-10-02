import { expect, test, type Browser, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import zlib from 'node:zlib'
import { newAccount, sql } from './helpers'

// Design Studio QA: gallery, canvas editor, autosave, images, export, isolation.
// One account per worker (beforeAll); every test creates its own design so a
// failing test does not poison the next one.

// ─── Shared helpers (kept local: only studio*.spec.ts files are ours) ─────
const SIZE_NAMES: Record<string, string> = {
  'ig-post': 'Instagram post',
  'ig-portrait': 'Instagram portrait',
  story: 'Story / Reel',
  'fb-post': 'Facebook post',
  linkedin: 'LinkedIn post',
  'x-post': 'X post',
  youtube: 'YouTube thumbnail',
}
const SIZES: Record<string, [number, number]> = {
  'ig-post': [1080, 1080],
  'ig-portrait': [1080, 1350],
  story: [1080, 1920],
  'fb-post': [1200, 630],
  linkedin: [1200, 627],
  'x-post': [1600, 900],
  youtube: [1280, 720],
}
const TEMPLATE_NAMES = ['Sale announcement', 'Quote', 'Product spotlight', 'Event invite', 'Tip of the day', 'Blank']
const TEMPLATE_LAYERS: Record<string, number> = {
  'Sale announcement': 6,
  Quote: 4,
  'Product spotlight': 4,
  'Event invite': 5,
  'Tip of the day': 4,
  Blank: 0,
}

type L = { id: string; type: string; name: string; x: number; y: number; w: number; h: number; rotation: number; [k: string]: unknown }
type DesignRow = { name: string; width: number; height: number; preview: string | null; data: { background: string; layers: L[] } }

export const workspaceOf = (email: string) =>
  sql(
    `select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}' order by w."createdAt" limit 1`,
  )
const design = (id: string): DesignRow | null => {
  const r = sql(`select json_build_object('name',name,'width',width,'height',height,'data',data,'preview',"previewMediaId") from "Design" where id='${id}'`)
  return r ? (JSON.parse(r) as DesignRow) : null
}
const idFromUrl = (page: Page) => page.url().split('/').pop()!.split('?')[0]
const canvas = (page: Page) => page.locator('div.relative.shadow-xl')
const layerEls = (page: Page) => canvas(page).locator('> div.absolute.inset-0 > div')
const handles = (page: Page) => canvas(page).locator('div.outline-sky-500 > span') // nw, ne, sw, se
const status = (page: Page) => page.getByText(/^(All changes saved|Unsaved changes|Saving…|Not saved)$/)
const num = (page: Page, k: 'X' | 'Y' | 'W' | 'H') => page.locator('aside label').filter({ hasText: new RegExp(`^${k}$`) }).locator('input')
const prop = (page: Page, label: string | RegExp) =>
  page.locator('aside div.mt-4').filter({ has: page.locator('p', { hasText: label }) }).first()

async function xywh(page: Page) {
  const v = async (k: 'X' | 'Y' | 'W' | 'H') => Number(await num(page, k).inputValue())
  return { x: await v('X'), y: await v('Y'), w: await v('W'), h: await v('H') }
}
async function scaleOf(page: Page, designW: number) {
  const b = (await canvas(page).boundingBox())!
  return b.width / designW
}
async function waitSaved(page: Page) {
  await expect(status(page)).toHaveText('All changes saved', { timeout: 15_000 })
}
async function newDesign(page: Page, template = 'Blank', sizeId = 'ig-post') {
  await page.goto('/app/studio')
  await page.getByRole('button', { name: new RegExp(`^${SIZE_NAMES[sizeId].replace('/', '\\/')} `) }).click()
  await page.locator('main button').filter({ has: page.locator('p', { hasText: new RegExp(`^${template}$`) }) }).click()
  await page.waitForURL(/\/app\/studio\/[a-z0-9]{20,}$/)
  await expect(canvas(page)).toBeVisible()
  return idFromUrl(page)
}
async function centerOf(page: Page, i: number) {
  const b = (await layerEls(page).nth(i).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
async function mouseDrag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let s = 1; s <= 8; s++) await page.mouse.move(from.x + (dx * s) / 8, from.y + (dy * s) / 8)
  await page.mouse.up()
}
async function selectLayer(page: Page, i: number) {
  const c = await centerOf(page, i)
  await page.mouse.click(c.x, c.y)
}
const add = {
  heading: (p: Page) => p.getByRole('button', { name: 'Add a heading' }).click(),
  sub: (p: Page) => p.getByRole('button', { name: 'Add a subheading' }).click(),
  body: (p: Page) => p.getByRole('button', { name: 'Add body text' }).click(),
  rect: (p: Page) => p.getByRole('button', { name: 'Add rectangle' }).click(),
  circle: (p: Page) => p.getByRole('button', { name: 'Add circle' }).click(),
}
async function setNum(page: Page, k: 'X' | 'Y' | 'W' | 'H', v: number) {
  await num(page, k).fill(String(v))
}

// Minimal PNG encoder for upload fixtures.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (b: Buffer) => {
  let c = 0xffffffff
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function makePng(w: number, h: number, px: (x: number, y: number) => [number, number, number]) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y)
      const o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
    }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
const pngSize = (b: Buffer) => ({ sig: b.subarray(0, 8).toString('hex'), w: b.readUInt32BE(16), h: b.readUInt32BE(20) })

async function downloadPng(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), page.getByRole('button', { name: 'Download PNG' }).click()])
  const path = await dl.path()
  return { name: dl.suggestedFilename(), buf: readFileSync(path!) }
}

// Rewrites the JSON body of the next server action POST matching `match`.
async function rewriteNextAction(page: Page, match: (body: string) => boolean, rewrite: (body: string) => string) {
  let done = false
  await page.route('**/app/studio**', async (route) => {
    const req = route.request()
    const body = req.postData() ?? ''
    if (!done && req.method() === 'POST' && req.headers()['next-action'] && match(body)) {
      done = true
      await route.continue({ postData: rewrite(body) })
    } else await route.continue()
  })
  return () => done
}

// ─── Fixture: one logged-in account per worker ───────────────────────────
let page: Page
let email: string
let ws: string
const problems: { test: string; kind: string; text: string }[] = []
let current = ''

async function boot(browser: Browser) {
  const ctx = await browser.newContext({ acceptDownloads: true })
  page = await ctx.newPage()
  page.on('console', (m) => m.type() === 'error' && problems.push({ test: current, kind: 'console', text: m.text().slice(0, 300) }))
  page.on('pageerror', (e) => problems.push({ test: current, kind: 'pageerror', text: String(e).slice(0, 300) }))
  page.on('response', (r) => r.status() >= 500 && problems.push({ test: current, kind: `HTTP ${r.status()}`, text: r.url() }))
  ;({ email } = await newAccount(page, 'qa-studio'))
  ws = workspaceOf(email)
}

test.beforeAll(async ({ browser }) => boot(browser))
test.beforeEach(async ({}, info) => {
  current = info.title
  page.removeAllListeners('dialog')
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await page.setViewportSize({ width: 1360, height: 900 })
})
test.afterEach(async ({}, info) => {
  const mine = problems.filter((p) => p.test === info.title)
  if (mine.length) console.log(`[${info.title}] console/5xx:\n  ` + mine.map((p) => `${p.kind}: ${p.text}`).join('\n  '))
  // 5xx are always a bug; console errors are reported by the log above.
  expect.soft(mine.filter((p) => p.kind.startsWith('HTTP')), '5xx responses').toEqual([])
})

// ─── 1. Gallery ──────────────────────────────────────────────────────────
test.describe('gallery', () => {
  test('all 7 formats are selectable and resize the template previews', async () => {
    await page.goto('/app/studio')
    for (const [id, name] of Object.entries(SIZE_NAMES)) {
      const btn = page.getByRole('button', { name: new RegExp(`^${name.replace('/', '\\/')} `) })
      await btn.click()
      await expect(btn).toHaveClass(/bg-zinc-900/)
      await expect(page.getByText(`Click to start a new ${name.toLowerCase()} from a template.`)).toBeVisible()
      // Sale preview aspect ratio follows the format.
      const pv = page.getByRole('button', { name: 'Sale announcement' }).locator('div.relative.overflow-hidden').last()
      const b = (await pv.boundingBox())!
      const [w, h] = SIZES[id]
      expect(Math.abs(b.width / b.height - w / h), `${id} preview ratio`).toBeLessThan(0.03)
    }
  })

  test('templates render in brand colours', async () => {
    sql(`update "BrandKit" set colors='{#123456,#ABCDEF}' where "workspaceId"='${ws}'`)
    expect(sql(`select colors from "BrandKit" where "workspaceId"='${ws}'`)).toBe('{#123456,#ABCDEF}')
    await page.goto('/app/studio')
    await page.getByRole('button', { name: /^Instagram post / }).click()
    const bg = async (t: string) =>
      page.getByRole('button', { name: t }).locator('div.relative.overflow-hidden').last().evaluate((e) => getComputedStyle(e).backgroundColor)
    expect(await bg('Sale announcement')).toBe('rgb(18, 52, 86)') // primary
    expect(await bg('Quote')).toBe('rgb(255, 255, 255)')
    expect(await bg('Product spotlight')).toBe('rgb(17, 17, 17)')
    expect(await bg('Event invite')).toBe('rgb(171, 205, 239)') // secondary
    expect(await bg('Tip of the day')).toBe('rgb(255, 255, 255)')
    expect(await bg('Blank')).toBe('rgb(255, 255, 255)')
    // Accent elements use the palette too.
    const html = (await page.locator('main').innerHTML()).toLowerCase()
    expect(html).toMatch(/#123456|rgb\(18, 52, 86\)/)
    expect(html).toMatch(/#abcdef|rgb\(171, 205, 239\)/)
  })

  for (const tpl of TEMPLATE_NAMES)
    for (const sizeId of ['ig-post', 'story', 'fb-post'])
      test(`create ${tpl} × ${sizeId} → Design row with the right size, opens editor`, async () => {
        const id = await newDesign(page, tpl, sizeId)
        const d = design(id)!
        const [w, h] = SIZES[sizeId]
        expect([d.width, d.height]).toEqual([w, h])
        expect(d.name).toBe(tpl === 'Blank' ? `Untitled ${SIZE_NAMES[sizeId]}` : `${tpl} · ${SIZE_NAMES[sizeId]}`)
        expect(d.data.layers).toHaveLength(TEMPLATE_LAYERS[tpl])
        await expect(layerEls(page)).toHaveCount(TEMPLATE_LAYERS[tpl])
        await expect(page.getByLabel('Resize design')).toHaveValue(sizeId)
        // Layers were scaled from the 1080 base onto the format.
        for (const l of d.data.layers) {
          expect(l.x + l.w, `${l.name} right edge`).toBeLessThanOrEqual(w * 1.25)
          expect(l.y, `${l.name} top`).toBeLessThanOrEqual(h)
        }
        if (tpl === 'Sale announcement') expect(d.data.background).toBe('#123456')
        // Canvas fits the stage.
        const s = await scaleOf(page, w)
        expect(s).toBeGreaterThan(0.2)
      })

  test('recent designs: list, search, duplicate, delete', async () => {
    const a = await newDesign(page, 'Quote', 'ig-post')
    sql(`update "Design" set name='Zebra QA ${a}' where id='${a}'`)
    const b = await newDesign(page, 'Tip of the day', 'ig-post')
    sql(`update "Design" set name='Yak QA ${b}' where id='${b}'`)
    await page.goto('/app/studio')
    const cards = page.locator('div.group.relative')
    await expect(cards.filter({ hasText: `Zebra QA ${a}` })).toHaveCount(1)
    await expect(cards.filter({ hasText: `Yak QA ${b}` })).toHaveCount(1)
    // Search (case-insensitive)
    await page.getByPlaceholder('Search').fill('zebra qa')
    await expect(cards).toHaveCount(1)
    await page.getByPlaceholder('Search').fill('nothing-matches-xyz')
    await expect(page.getByText('No designs match your search.')).toBeVisible()
    await page.getByPlaceholder('Search').fill('')
    // Opening a card goes to the editor.
    await cards.filter({ hasText: `Yak QA ${b}` }).getByRole('link').click()
    await page.waitForURL(new RegExp(`/app/studio/${b}$`))
    await page.goto('/app/studio')
    // Duplicate
    const card = cards.filter({ hasText: `Zebra QA ${a}` }).first()
    await card.hover()
    await card.getByRole('button', { name: 'Duplicate' }).click()
    await expect(cards.filter({ hasText: `Zebra QA ${a} (copy)` })).toHaveCount(1)
    expect(Number(sql(`select count(*) from "Design" where "workspaceId"='${ws}' and name='Zebra QA ${a} (copy)'`))).toBe(1)
    const copyData = sql(`select data::text from "Design" where "workspaceId"='${ws}' and name='Zebra QA ${a} (copy)'`)
    expect(copyData).toBe(sql(`select data::text from "Design" where id='${a}'`))
    // Delete (dismiss first, then accept)
    const yak = cards.filter({ hasText: `Yak QA ${b}` }).first()
    page.once('dialog', (d) => d.dismiss())
    await yak.hover()
    await yak.getByRole('button', { name: 'Delete' }).click()
    await page.waitForTimeout(500)
    expect(design(b)).not.toBeNull()
    page.once('dialog', (d) => d.accept())
    await yak.hover()
    await yak.getByRole('button', { name: 'Delete' }).click()
    await expect(cards.filter({ hasText: `Yak QA ${b}` })).toHaveCount(0)
    expect(design(b)).toBeNull()
  })
})

// ─── 2. Editor interactions ─────────────────────────────────────────────
test.describe('editor', () => {
  test('add heading/subheading/body/rectangle/circle, autosave, select, Escape', async () => {
    const id = await newDesign(page)
    await add.heading(page)
    await add.sub(page)
    await add.body(page)
    await add.rect(page)
    await add.circle(page)
    await expect(layerEls(page)).toHaveCount(5)
    const rows = page.locator('aside div.border-t button')
    await expect(rows).toHaveCount(5)
    await waitSaved(page)
    const d = design(id)!
    expect(d.data.layers.map((l) => `${l.type}:${l.name}`)).toEqual([
      'text:Heading',
      'text:Subheading',
      'text:Body text',
      'shape:Rectangle',
      'shape:Circle',
    ])
    // Last added is selected; Escape deselects.
    await expect(page.locator('aside p.text-sm.font-semibold').filter({ hasText: 'Circle' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Select a layer to edit it.')).toBeVisible()
    // Clicking a layer on the canvas selects the topmost one under the cursor (circle).
    await selectLayer(page, 4)
    await expect(page.locator('aside p.text-sm.font-semibold').filter({ hasText: 'Circle' })).toBeVisible()
    // Selecting via the layer list works too.
    await rows.filter({ hasText: 'Rectangle' }).click()
    await expect(page.locator('aside p.text-sm.font-semibold').filter({ hasText: 'Rectangle' })).toBeVisible()
  })

  test('drag to move with the mouse; whole drag is one undo step', async () => {
    const id = await newDesign(page)
    await add.rect(page)
    await waitSaved(page)
    const before = await xywh(page)
    const s = await scaleOf(page, 1080)
    await mouseDrag(page, await centerOf(page, 0), 100, 60)
    const after = await xywh(page)
    expect(Math.abs(after.x - (before.x + 100 / s))).toBeLessThanOrEqual(2)
    expect(Math.abs(after.y - (before.y + 60 / s))).toBeLessThanOrEqual(2)
    await waitSaved(page)
    expect(design(id)!.data.layers[0].x).toBe(after.x)
    await page.getByRole('button', { name: 'Undo' }).click()
    expect(await xywh(page)).toEqual(before)
    await page.getByRole('button', { name: 'Redo' }).click()
    expect(await xywh(page)).toEqual(after)
  })

  test('resize via each of the 4 corner handles', async () => {
    await newDesign(page)
    await add.rect(page)
    const s = await scaleOf(page, 1080)
    const d = 40
    const cases: [number, number, number][] = [
      [0, -d, -d], // nw grows up-left
      [1, d, -d], // ne
      [2, -d, d], // sw
      [3, d, d], // se
    ]
    for (const [i, dx, dy] of cases) {
      const o = await xywh(page)
      const hb = (await handles(page).nth(i).boundingBox())!
      await mouseDrag(page, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, dx, dy)
      const n = await xywh(page)
      const grow = d / s
      expect(Math.abs(n.w - (o.w + grow)), `handle ${i} w`).toBeLessThanOrEqual(2)
      expect(Math.abs(n.h - (o.h + grow)), `handle ${i} h`).toBeLessThanOrEqual(2)
      // The opposite corner stays put.
      if (i === 0 || i === 2) expect(Math.abs(n.x + n.w - (o.x + o.w))).toBeLessThanOrEqual(1)
      else expect(n.x).toBe(o.x)
      if (i === 0 || i === 1) expect(Math.abs(n.y + n.h - (o.y + o.h))).toBeLessThanOrEqual(1)
      else expect(n.y).toBe(o.y)
    }
    // Shrinking below the minimum clamps to 20.
    const hb = (await handles(page).nth(3).boundingBox())!
    await mouseDrag(page, { x: hb.x + 6, y: hb.y + 6 }, -2000, -2000)
    const n = await xywh(page)
    expect([n.w, n.h]).toEqual([20, 20])
  })

  test('double-click text edits inline; blur by clicking the panel commits', async () => {
    const id = await newDesign(page)
    await add.heading(page)
    await page.keyboard.press('Escape')
    const c = await centerOf(page, 0)
    await page.mouse.dblclick(c.x, c.y)
    const ta = canvas(page).locator('textarea')
    await expect(ta).toBeVisible()
    await expect(ta).toBeFocused()
    await ta.press('ControlOrMeta+a')
    await ta.pressSequentially('Inline QA')
    // Backspace while typing must not delete the layer.
    await ta.press('Backspace')
    await ta.press('Backspace')
    await page.getByRole('button', { name: 'Elements' }).click() // blur
    await expect(ta).toHaveCount(0)
    await expect(layerEls(page)).toHaveCount(1)
    await expect(layerEls(page).nth(0)).toHaveText('Inline ')
    await waitSaved(page)
    expect(design(id)!.data.layers[0].text).toBe('Inline ')
  })

  test('inline text edit is kept when clicking an empty area of the stage', async () => {
    const id = await newDesign(page)
    await add.heading(page)
    await page.keyboard.press('Escape')
    const c = await centerOf(page, 0)
    await page.mouse.dblclick(c.x, c.y)
    const ta = canvas(page).locator('textarea')
    await ta.press('ControlOrMeta+a')
    await ta.pressSequentially('Typed then clicked away')
    // Click the grey stage outside the artboard (natural way to finish editing).
    const cb = (await canvas(page).boundingBox())!
    await page.mouse.click(cb.x - 15, cb.y + 20)
    await expect(ta).toHaveCount(0)
    await expect(layerEls(page).nth(0)).toHaveText('Typed then clicked away')
    await page.waitForTimeout(2000)
    expect(design(id)!.data.layers[0].text).toBe('Typed then clicked away')
  })

  test('property panel: text props, colours, shape props, X/Y/W/H, rotation persist', async () => {
    const id = await newDesign(page)
    await add.heading(page)
    const panelText = prop(page, /^Text$/).locator('textarea')
    await panelText.fill('Props QA')
    await expect(layerEls(page).nth(0)).toHaveText('Props QA')
    // Backspace in the property textarea must not delete the layer.
    await panelText.press('End')
    await panelText.press('Backspace')
    await expect(layerEls(page)).toHaveCount(1)
    await expect(layerEls(page).nth(0)).toHaveText('Props Q')
    await prop(page, /^Font$/).locator('select').selectOption('Georgia')
    await prop(page, /^Size$/).locator('input').fill('120')
    await prop(page, /^Weight$/).locator('select').selectOption('400')
    await page.getByRole('button', { name: 'Align right' }).click()
    await prop(page, /^Line height$/).locator('input').fill('1.5')
    await prop(page, /^Colour$/).getByRole('button', { name: 'Colour #6B7280' }).click()
    const inner = layerEls(page).nth(0).locator('> div')
    await expect(inner).toHaveCSS('font-family', 'Georgia')
    await expect(inner).toHaveCSS('font-weight', '400')
    await expect(inner).toHaveCSS('text-align', 'right')
    await expect(inner).toHaveCSS('color', 'rgb(107, 114, 128)')
    await prop(page, /^Colour$/).getByLabel('Custom colour').fill('#00ff00')
    await expect(inner).toHaveCSS('color', 'rgb(0, 255, 0)')
    await setNum(page, 'X', 10)
    await setNum(page, 'Y', 20)
    await setNum(page, 'W', 500)
    await setNum(page, 'H', 300)
    await prop(page, /^Rotation/).locator('input').fill('45')
    await expect(layerEls(page).nth(0)).toHaveCSS('transform', /matrix\(0\.707/)
    await waitSaved(page)
    const t = design(id)!.data.layers[0]
    expect(t).toMatchObject({ text: 'Props Q', fontFamily: 'Georgia', fontSize: 120, fontWeight: 400, align: 'right', lineHeight: 1.5, color: '#00ff00', x: 10, y: 20, w: 500, h: 300, rotation: 45 })

    await add.rect(page)
    await prop(page, /^Fill$/).getByRole('button', { name: 'Colour #111111' }).click()
    await prop(page, /^Corner radius$/).locator('input').fill('60')
    await prop(page, /^Opacity/).locator('input').fill('0.5')
    const rect = layerEls(page).nth(1).locator('> div')
    await expect(rect).toHaveCSS('background-color', 'rgb(17, 17, 17)')
    await expect(rect).toHaveCSS('opacity', '0.5')
    await prop(page, /^Fill$/).getByLabel('Custom colour').fill('#ff00aa')
    await expect(rect).toHaveCSS('background-color', 'rgb(255, 0, 170)')
    await waitSaved(page)
    expect(design(id)!.data.layers[1]).toMatchObject({ fill: '#ff00aa', radius: 60, opacity: 0.5 })
    await page.reload()
    await expect(layerEls(page)).toHaveCount(2)
    await expect(layerEls(page).nth(0)).toHaveText('Props Q')
  })

  test('number inputs accept typed values (e.g. font size 120 typed digit by digit)', async () => {
    await newDesign(page)
    await add.heading(page)
    const size = prop(page, /^Size$/).locator('input')
    await size.click()
    await size.press('ControlOrMeta+a')
    await size.pressSequentially('120')
    await expect(size).toHaveValue('120')
  })

  test('layer reorder up/down', async () => {
    const id = await newDesign(page)
    await add.rect(page)
    await add.circle(page) // selected, on top
    await page.getByRole('button', { name: 'Send backward' }).click()
    await waitSaved(page)
    expect(design(id)!.data.layers.map((l) => l.name)).toEqual(['Circle', 'Rectangle'])
    await page.getByRole('button', { name: 'Send backward' }).click() // already at bottom → no-op
    await page.getByRole('button', { name: 'Bring forward' }).click()
    await waitSaved(page)
    expect(design(id)!.data.layers.map((l) => l.name)).toEqual(['Rectangle', 'Circle'])
  })

  test('duplicate (button + ⌘/Ctrl+D) and delete (button, Backspace, Delete)', async () => {
    const id = await newDesign(page)
    await add.rect(page)
    const o = await xywh(page)
    await page.getByRole('button', { name: 'Duplicate' }).click()
    await expect(layerEls(page)).toHaveCount(2)
    expect(await xywh(page)).toMatchObject({ x: o.x + 30, y: o.y + 30 })
    await page.locator('body').click({ position: { x: 5, y: 5 }, force: true }).catch(() => {}) // move focus off the button
    await selectLayer(page, 1)
    await page.keyboard.press('ControlOrMeta+d')
    await expect(layerEls(page)).toHaveCount(3)
    await waitSaved(page)
    // A copy of a copy keeps the "copy" suffix once, so names never outgrow the 80-char limit.
    expect(design(id)!.data.layers.map((l) => l.name)).toEqual(['Rectangle', 'Rectangle copy', 'Rectangle copy'])
    // Backspace inside X input must not delete the layer.
    await num(page, 'X').click()
    await num(page, 'X').press('Backspace')
    await expect(layerEls(page)).toHaveCount(3)
    await selectLayer(page, 2)
    await page.keyboard.press('Backspace')
    await expect(layerEls(page)).toHaveCount(2)
    await selectLayer(page, 1)
    await page.keyboard.press('Delete')
    await expect(layerEls(page)).toHaveCount(1)
    await selectLayer(page, 0)
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(layerEls(page)).toHaveCount(0)
    await waitSaved(page)
    expect(design(id)!.data.layers).toHaveLength(0)
  })

  test('arrow nudge (+shift ×10), keyboard undo/redo', async () => {
    const id = await newDesign(page)
    await add.rect(page)
    await page.keyboard.press('Escape')
    await selectLayer(page, 0)
    const o = await xywh(page)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('Shift+ArrowUp')
    expect(await xywh(page)).toMatchObject({ x: o.x + 1 - 10, y: o.y + 1 - 10 })
    await page.keyboard.press('ControlOrMeta+z')
    expect(await xywh(page)).toMatchObject({ x: o.x - 9, y: o.y + 1 })
    await page.keyboard.press('ControlOrMeta+Shift+z')
    expect(await xywh(page)).toMatchObject({ x: o.x - 9, y: o.y - 9 })
    await waitSaved(page)
    expect(design(id)!.data.layers[0]).toMatchObject({ x: o.x - 9, y: o.y - 9 })
  })

  test('selecting a layer by click does not add an undo step', async () => {
    await newDesign(page)
    await add.rect(page)
    await setNum(page, 'X', 0)
    await add.circle(page)
    await setNum(page, 'X', 600)
    await page.keyboard.press('Escape')
    await selectLayer(page, 0)
    const o = await xywh(page)
    await page.keyboard.press('ArrowRight') // rect x+1
    await selectLayer(page, 1) // just select the circle
    await page.keyboard.press('Escape')
    await page.keyboard.press('ControlOrMeta+z') // should undo the nudge
    await selectLayer(page, 0)
    expect((await xywh(page)).x, 'one undo after a plain click should revert the nudge').toBe(o.x)
  })

  test('undo of a format change restores the format too', async () => {
    const id = await newDesign(page, 'Sale announcement', 'ig-post')
    await page.getByLabel('Resize design').selectOption('fb-post')
    await waitSaved(page)
    await page.getByRole('button', { name: 'Undo' }).click()
    await waitSaved(page)
    const d = design(id)!
    // Layers are back in 1080×1080 coordinates, so the size must be too.
    expect(d.data.layers.find((l) => l.name === 'Headline')!.fontSize).toBe(170)
    expect([d.width, d.height]).toEqual([1080, 1080])
    await expect(page.getByLabel('Resize design')).toHaveValue('ig-post')
  })
})

// ─── 3. Autosave, rename, resize format ─────────────────────────────────
test.describe('autosave', () => {
  test('status text, rename, persisted after reload', async () => {
    const id = await newDesign(page)
    await add.rect(page)
    await expect(status(page)).toHaveText(/Unsaved changes|Saving…/)
    await waitSaved(page)
    await page.getByLabel('Design name').fill('QA renamed design')
    await expect(status(page)).toHaveText(/Unsaved changes|Saving…/)
    await waitSaved(page)
    expect(design(id)!.name).toBe('QA renamed design')
    await page.reload()
    await expect(page.getByLabel('Design name')).toHaveValue('QA renamed design')
    await expect(layerEls(page)).toHaveCount(1)
    // Empty name saves as "Untitled".
    await page.getByLabel('Design name').fill('   ')
    await waitSaved(page)
    expect(design(id)!.name).toBe('Untitled')
  })

  test('resize format via dropdown scales layers and font size, persisted', async () => {
    const id = await newDesign(page, 'Sale announcement', 'ig-post')
    const base = design(id)!.data.layers
    await page.getByLabel('Resize design').selectOption('story')
    await waitSaved(page)
    let d = design(id)!
    expect([d.width, d.height]).toEqual([1080, 1920])
    const hl = (ls: L[]) => ls.find((l) => l.name === 'Headline')!
    expect(hl(d.data.layers).y).toBeCloseTo(hl(base).y * (1920 / 1080), 3)
    expect(hl(d.data.layers).fontSize).toBe(170)
    await page.getByLabel('Resize design').selectOption('fb-post')
    await waitSaved(page)
    d = design(id)!
    expect([d.width, d.height]).toEqual([1200, 630])
    expect(hl(d.data.layers).fontSize).toBe(Math.round(170 * (630 / 1920))) // 56
    await page.reload()
    await expect(page.getByLabel('Resize design')).toHaveValue('fb-post')
    await expect(page.getByText(/1200×630 · \d+%/)).toBeVisible()
  })

  test('an edit made while a save is in flight is still saved', async () => {
    const id = await newDesign(page)
    await add.rect(page)
    await waitSaved(page)
    await page.keyboard.press('Escape')
    await selectLayer(page, 0)
    const o = await xywh(page)
    // Delay the response of the next save by 1s (server already wrote it).
    let delayed = false
    await page.route(`**/app/studio/${id}`, async (route) => {
      if (!delayed && route.request().method() === 'POST' && route.request().headers()['next-action']) {
        delayed = true
        const res = await route.fetch()
        await new Promise((r) => setTimeout(r, 1000))
        await route.fulfill({ response: res })
      } else await route.continue()
    })
    await page.keyboard.press('ArrowRight') // edit A
    await expect(status(page)).toHaveText('Saving…')
    await page.waitForTimeout(300)
    await page.keyboard.press('ArrowRight') // edit B during the in-flight save
    await waitSaved(page)
    await page.waitForTimeout(2500)
    await expect(status(page)).toHaveText('All changes saved')
    expect(design(id)!.data.layers[0].x, 'DB should contain edit B').toBe(o.x + 2)
  })

  test('leaving the editor right after an edit does not lose it', async () => {
    const id = await newDesign(page)
    await add.rect(page)
    await waitSaved(page)
    await page.keyboard.press('Escape')
    await selectLayer(page, 0)
    const o = await xywh(page)
    await page.keyboard.press('Shift+ArrowRight')
    await page.getByRole('link', { name: 'Back to Studio' }).click()
    await page.waitForURL(/\/app\/studio$/)
    await page.waitForTimeout(2500)
    expect(design(id)!.data.layers[0].x, 'last edit before leaving').toBe(o.x + 10)
  })
})

// ─── 4. Templates tab ───────────────────────────────────────────────────
test.describe('templates tab', () => {
  test('applying a template confirms when layers exist; not on an empty design', async () => {
    const id = await newDesign(page)
    await page.getByRole('button', { name: 'Templates' }).click()
    let dialogs = 0
    page.on('dialog', (d) => {
      dialogs++
      void (d.message().includes('Replace') && dialogs === 2 ? d.dismiss() : d.accept())
    })
    await page.locator('aside').getByRole('button', { name: 'Quote', exact: true }).click()
    await expect(layerEls(page)).toHaveCount(4)
    expect(dialogs).toBe(0)
    // Second application: dialog #1 → accept? Our handler dismisses dialog #2.
    await page.locator('aside').getByRole('button', { name: 'Tip of the day', exact: true }).click()
    expect(dialogs).toBe(1)
    await expect(layerEls(page)).toHaveCount(4) // Tip has 4 layers too; check content
    await expect(canvas(page)).toContainText('TIP #1')
    await page.locator('aside').getByRole('button', { name: 'Sale announcement', exact: true }).click()
    expect(dialogs).toBe(2)
    await expect(canvas(page)).toContainText('TIP #1') // dismissed → unchanged
    await waitSaved(page)
    expect(design(id)!.data.layers.some((l) => l.text === 'TIP #1')).toBe(true)
  })
})

// ─── 5. Images ──────────────────────────────────────────────────────────
test.describe('images', () => {
  test('add image via media picker upload; fit/radius/opacity; persisted', async () => {
    const id = await newDesign(page)
    await page.getByRole('button', { name: 'Images' }).click()
    await page.getByRole('button', { name: 'Upload or choose image' }).click()
    const png = makePng(400, 200, (x) => (x < 200 ? [255, 0, 0] : [0, 0, 255]))
    await page.locator('input[type=file]').setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByRole('button', { name: 'Add 1 image' })).toBeEnabled()
    await page.getByRole('button', { name: 'Add 1 image' }).click()
    await expect(layerEls(page)).toHaveCount(1)
    const img = layerEls(page).nth(0).locator('img')
    await expect(img).toHaveAttribute('src', /^\/media\/[a-z0-9]+$/)
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(400)
    await expect(img).toHaveCSS('object-fit', 'cover')
    await page.getByRole('button', { name: 'Fit', exact: true }).click()
    await expect(img).toHaveCSS('object-fit', 'contain')
    await prop(page, /^Corner radius$/).locator('input').fill('100')
    await prop(page, /^Opacity/).locator('input').fill('0.4')
    await expect(img).toHaveCSS('opacity', '0.4')
    await expect(img).not.toHaveCSS('border-radius', '0px')
    await waitSaved(page)
    const l = design(id)!.data.layers[0]
    expect(l).toMatchObject({ type: 'image', fit: 'contain', radius: 100, opacity: 0.4 })
    expect(sql(`select "workspaceId" from "Media" where id='${l.mediaId}'`)).toBe(ws)
    expect(l.src).toBe(`/media/${l.mediaId}`)
    // Export with an image works and is the right size.
    const { buf } = await downloadPng(page)
    expect(pngSize(buf)).toMatchObject({ sig: '89504e470d0a1a0a', w: 1080, h: 1080 })
  })
})

// ─── 6. Export ──────────────────────────────────────────────────────────
test.describe('export', () => {
  for (const sizeId of ['ig-post', 'story', 'x-post'])
    test(`Download PNG has the design's pixel size (${sizeId})`, async () => {
      await newDesign(page, 'Event invite', sizeId)
      const { name, buf } = await downloadPng(page)
      expect(name).toMatch(/\.png$/)
      const [w, h] = SIZES[sizeId]
      expect(pngSize(buf)).toEqual({ sig: '89504e470d0a1a0a', w, h })
    })

  test('Use in post creates Media + Post and opens /app/posts/{id}', async () => {
    const id = await newDesign(page, 'Sale announcement', 'ig-post')
    const before = Number(sql(`select count(*) from "Media" where "workspaceId"='${ws}'`))
    await page.getByRole('button', { name: 'Use in post' }).click()
    await page.waitForURL(/\/app\/posts\/[a-z0-9]+/, { timeout: 30_000 })
    const postId = idFromUrl(page)
    const post = JSON.parse(sql(`select json_build_object('ws',"workspaceId",'media',"mediaIds",'kind',kind,'status',status) from "Post" where id='${postId}'`))
    expect(post).toMatchObject({ ws, kind: 'SOCIAL', status: 'DRAFT' })
    expect(post.media).toHaveLength(1)
    const media = JSON.parse(sql(`select json_build_object('mime',mime,'prompt',prompt,'ws',"workspaceId") from "Media" where id='${post.media[0]}'`))
    expect(media).toMatchObject({ mime: 'image/png', ws, prompt: 'Studio: Sale announcement · Instagram post' })
    expect(Number(sql(`select count(*) from "Media" where "workspaceId"='${ws}'`))).toBe(before + 1)
    expect(design(id)!.preview).toBe(post.media[0])
    // The post page shows the image.
    await expect(page.locator(`img[src="/media/${post.media[0]}"]`).first()).toBeVisible()
    const res = await page.request.get(`/media/${post.media[0]}`)
    expect(res.status()).toBe(200)
    expect(pngSize(await res.body())).toMatchObject({ w: 1080, h: 1080 })
  })

  test('gallery thumbnail is not stale after editing an exported design', async () => {
    const id = await newDesign(page, 'Sale announcement', 'ig-post')
    await page.getByRole('button', { name: 'Use in post' }).click()
    await page.waitForURL(/\/app\/posts\//)
    const oldPreview = design(id)!.preview
    await page.goto(`/app/studio/${id}`)
    await page.getByRole('button', { name: 'Brand', exact: true }).click()
    await page.getByRole('button', { name: 'Background #111111' }).click()
    await waitSaved(page)
    await page.goto('/app/studio')
    const card = page.locator('div.group.relative').filter({ has: page.locator(`a[href="/app/studio/${id}"]`) })
    await expect(card.locator(`img[src="/media/${oldPreview}"]`), 'thumbnail still shows the pre-edit export').toHaveCount(0)
  })

  test('exported PNG visually matches the editor (text wrapping, fonts)', async () => {
    const SP = test.info().outputPath()
    const results: Record<string, number> = {}
    for (const tpl of ['Quote', 'Event invite', 'Sale announcement']) {
      await newDesign(page, tpl, 'ig-post')
      results[tpl] = await compareExport(page, `${SP}/${tpl.replace(/\W+/g, '-')}`)
    }
    // A long unbreakable word: DOM breaks it (overflow-wrap), canvas does not.
    await newDesign(page)
    await add.heading(page)
    await prop(page, /^Text$/).locator('textarea').fill('Supercalifragilisticexpialidocious offer')
    await page.keyboard.press('Escape')
    await page.locator('body').press('Escape')
    results['long word'] = await compareExport(page, `${SP}/long-word`)
    console.log('visual diff ratios (share of pixels differing):', JSON.stringify(results), 'images in', SP)
    // Templates: small consistent vertical text offset is tolerated here (reported separately).
    for (const k of ['Quote', 'Event invite', 'Sale announcement']) expect.soft(results[k], `${k} diff ratio`).toBeLessThan(0.06)
    // A long word must wrap in the export like in the editor (no clipped text).
    expect.soft(results['long word'], 'long word: export wraps differently from the editor').toBeLessThan(0.02)
  })
})

async function compareExport(page: Page, prefix: string) {
  await page.mouse.click(5, 895) // neutral spot to blur inputs
  await page.keyboard.press('Escape')
  await waitSaved(page).catch(() => {})
  const shot = await canvas(page).screenshot()
  const { buf } = await downloadPng(page)
  const { writeFileSync } = await import('node:fs')
  writeFileSync(`${prefix}-dom.png`, shot)
  writeFileSync(`${prefix}-export.png`, buf)
  const out = await page.evaluate(
    async ({ a, b }) => {
      const load = (src: string) => new Promise<HTMLImageElement>((r) => { const i = new Image(); i.onload = () => r(i); i.src = src })
      const ia = await load(`data:image/png;base64,${a}`)
      const ib = await load(`data:image/png;base64,${b}`)
      const W = ia.width, H = ia.height
      const draw = (img: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')!; x.drawImage(img, 0, 0, W, H); return x.getImageData(0, 0, W, H).data }
      const da = draw(ia), db = draw(ib)
      const diff = document.createElement('canvas'); diff.width = W; diff.height = H
      const dx = diff.getContext('2d')!; const im = dx.createImageData(W, H)
      let n = 0
      for (let p = 0; p < da.length; p += 4) {
        const d = Math.abs(da[p] - db[p]) + Math.abs(da[p + 1] - db[p + 1]) + Math.abs(da[p + 2] - db[p + 2])
        const hit = d > 150
        if (hit) n++
        im.data[p] = hit ? 255 : da[p] / 3; im.data[p + 1] = hit ? 0 : da[p + 1] / 3; im.data[p + 2] = hit ? 0 : da[p + 2] / 3; im.data[p + 3] = 255
      }
      dx.putImageData(im, 0, 0)
      return { ratio: n / (W * H), diff: diff.toDataURL('image/png').split(',')[1] }
    },
    { a: shot.toString('base64'), b: buf.toString('base64') },
  )
  writeFileSync(`${prefix}-diff.png`, Buffer.from(out.diff, 'base64'))
  return Math.round(out.ratio * 10000) / 10000
}
