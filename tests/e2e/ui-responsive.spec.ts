import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { newAccount, sql } from './helpers'

// Responsive sweep of the public + app shell, console/network errors and a
// quick accessibility pass. Screenshots of problems go to test-results/ui-shots.

const SHOTS = 'test-results/ui-shots'
mkdirSync(SHOTS, { recursive: true })

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1360, height: 900 },
]
const PUBLIC = ['/', '/login', '/signup']
const APP = [
  '/app/planner',
  '/app/create',
  '/app/campaigns',
  '/app/studio',
  '/app/bio',
  '/app/brand',
  '/app/credits',
  '/app/channels',
  '/app/inbox',
  '/app/workflows',
]

let ctx: BrowserContext
let page: Page
let bioEditor: string

function watch(p: Page, sink: string[], where: () => string) {
  p.on('console', (m) => m.type() === 'error' && sink.push(`${where()} console: ${m.text().slice(0, 300)}`))
  p.on('pageerror', (e) => sink.push(`${where()} pageerror: ${e.message.slice(0, 300)}`))
  p.on('response', (r) => {
    const own = r.url().startsWith('http://localhost:3100')
    if (r.status() >= 500 || (own && r.status() >= 400)) sink.push(`${where()} HTTP ${r.status()} ${r.url()}`)
  })
  p.on('requestfailed', (r) => {
    const t = r.failure()?.errorText ?? ''
    if (!/ERR_ABORTED|NS_BINDING_ABORTED/.test(t)) sink.push(`${where()} requestfailed ${r.url()} ${t}`)
  })
}

// Widest elements that stick out to the right of the viewport (not inside a scroll/clip box).
async function overflow(p: Page) {
  return p.evaluate(() => {
    const iw = window.innerWidth
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.right <= iw + 1) continue
      let a = el.parentElement
      let clipped = false
      while (a && a !== document.body) {
        if (getComputedStyle(a).overflowX !== 'visible' && !a.classList.contains('overflow-x-clip')) {
          clipped = true
          break
        }
        a = a.parentElement
      }
      if (!clipped) out.push(`<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') ?? '').slice(0, 80)}"> right=${Math.round(r.right)} w=${Math.round(r.width)}`)
    }
    return { sw: document.documentElement.scrollWidth, iw, els: out.slice(0, 5) }
  })
}

const slugify = (s: string) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'

test.describe.configure({ mode: 'default' })

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  ctx = await browser.newContext()
  page = await ctx.newPage()
  await newAccount(page, 'qa-bio', 'QA Bio Responsive')
  await page.goto('/app/bio')
  await page.getByRole('button', { name: 'New bio page' }).first().click()
  await page.waitForURL(/\/app\/bio\/[a-z0-9]+$/)
  bioEditor = new URL(page.url()).pathname
})

test.afterAll(async () => ctx?.close())

for (const vp of VIEWPORTS) {
  test(`ui: responsive sweep ${vp.name} ${vp.width}x${vp.height} — no horizontal scroll, no errors`, async ({ browser }) => {
    test.setTimeout(400_000)
    const problems: string[] = []
    let where = ''
    // public pages in a session-less context (logged-in users get redirected away from /login)
    const anonCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const anon = await anonCtx.newPage()
    watch(anon, problems, () => where)
    await page.setViewportSize({ width: vp.width, height: vp.height })
    const errs: string[] = []
    watch(page, errs, () => where)

    const visit = async (p: Page, path: string) => {
      where = `[${vp.name}] ${path}`
      const res = await p.goto(path)
      if ((res?.status() ?? 0) >= 400) problems.push(`${where} status ${res?.status()}`)
      await p.waitForLoadState('networkidle').catch(() => {})
      const o = await overflow(p)
      if (o.sw > o.iw) {
        const file = `${SHOTS}/overflow-${vp.name}-${slugify(path)}.png`
        await p.screenshot({ path: file, fullPage: true })
        problems.push(`${where} horizontal scroll: scrollWidth ${o.sw} > ${o.iw}; ${o.els.join(' | ')} (${file})`)
      }
      // Nothing may stick out of the white content panel of the app shell.
      const panelOut = await p.evaluate(() => {
        const panel = document.querySelector('main > div.rounded-2xl') as HTMLElement | null
        if (!panel) return []
        const pr = panel.getBoundingClientRect()
        const out: string[] = []
        for (const el of Array.from(panel.querySelectorAll('*'))) {
          const b = el.getBoundingClientRect()
          if (b.width === 0 || b.right <= pr.right + 0.5) continue
          let a = el.parentElement
          let clipped = false
          while (a && a !== panel) {
            if (getComputedStyle(a).overflowX !== 'visible') { clipped = true; break }
            a = a.parentElement
          }
          if (!clipped && getComputedStyle(el).position !== 'fixed') out.push(`<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') ?? '').slice(0, 70)}"> right=${Math.round(b.right)} > panel ${Math.round(pr.right)}`)
        }
        return out.slice(0, 3)
      })
      if (panelOut.length) {
        const file = `${SHOTS}/panel-overflow-${vp.name}-${slugify(path)}.png`
        await p.screenshot({ path: file })
        problems.push(`${where} content sticks out of the app panel: ${panelOut.join(' | ')} (${file})`)
      }
      // The page title/heading must not be covered by the sticky mobile bar or anything else.
      // Visually hidden (sr-only) headings exist for screen readers only and can't be covered.
      const h = p.locator('main h1:not(.sr-only), body h1:not(.sr-only)').first()
      if (await h.count()) {
        await h.scrollIntoViewIfNeeded().catch(() => {})
        const covered = await h.evaluate((el) => {
          const r = el.getBoundingClientRect()
          const hit = document.elementFromPoint(r.left + Math.min(10, r.width / 2), r.top + r.height / 2)
          return hit && !el.contains(hit) && !hit.contains(el) ? `${hit.tagName}.${hit.getAttribute('class')?.slice(0, 60)}` : null
        })
        if (covered) problems.push(`${where} h1 covered by ${covered}`)
      }
    }

    for (const path of PUBLIC) await visit(anon, path)
    for (const path of [...APP, bioEditor]) await visit(page, path)
    problems.push(...errs)
    await anonCtx.close()
    expect(problems).toEqual([])
  })

  test(`ui: sidebar / drawer and "Create new" menu fully visible ${vp.name}`, async () => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/app/planner')
    const mobile = vp.width < 1024
    let scope = page.locator('aside').first()
    if (mobile) {
      await expect(page.locator('aside.lg\\:flex')).toBeHidden()
      await page.getByRole('button', { name: 'Open menu' }).click()
      scope = page.locator('div.fixed.inset-0 aside')
      await expect(scope).toBeVisible()
      await expect(scope).toBeInViewport({ ratio: 1 })
    } else {
      scope = page.locator('aside.lg\\:flex')
      await expect(scope).toBeVisible()
    }
    await scope.getByRole('button', { name: 'Create new' }).click()
    const menu = scope.locator('div.fixed.z-\\[60\\]')
    await expect(menu).toBeVisible()
    const box = await menu.boundingBox()
    const vw = vp.width
    const vh = vp.height
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw)
    expect(box!.y + box!.height, 'Create menu clipped at the bottom').toBeLessThanOrEqual(vh)
    for (const label of ['New post or thread', 'New AI social post', 'New AI social campaign', 'New blog', 'New AI blog', 'New AI blog campaign']) {
      const l = menu.getByRole('link', { name: new RegExp(label) }).first()
      await expect(l).toBeInViewport({ ratio: 1 })
      // the item is on top (not covered)
      const covered = await l.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return hit && !el.contains(hit) ? hit.outerHTML.slice(0, 80) : null
      })
      expect(covered, `${label} covered`).toBeNull()
    }
    // Escape closes it
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    if (mobile) {
      // a nav link closes the drawer and navigates
      await scope.getByRole('link', { name: 'Bio Pages' }).click()
      await expect(page).toHaveURL(/\/app\/bio$/)
      await expect(page.locator('div.fixed.inset-0 aside')).toHaveCount(0)
      // X button closes
      await page.getByRole('button', { name: 'Open menu' }).click()
      await page.locator('div.fixed.inset-0 aside').getByRole('button', { name: 'Close menu' }).click()
      await expect(page.locator('div.fixed.inset-0 aside')).toHaveCount(0)
      // backdrop closes
      await page.getByRole('button', { name: 'Open menu' }).click()
      await page.mouse.click(vw - 10, vh / 2)
      await expect(page.locator('div.fixed.inset-0 aside')).toHaveCount(0)
      // Create menu item navigates and closes the drawer
      await page.getByRole('button', { name: 'Open menu' }).click()
      await page.locator('div.fixed.inset-0 aside').getByRole('button', { name: 'Create new' }).click()
      await page.getByRole('link', { name: /New AI social post/ }).click()
      await expect(page).toHaveURL(/\/app\/create$/)
      await expect(page.locator('div.fixed.inset-0 aside')).toHaveCount(0)
    } else {
      await scope.getByRole('button', { name: 'Create new' }).click()
      await menu.getByRole('link', { name: /New AI social post/ }).click()
      await expect(page).toHaveURL(/\/app\/create$/)
      await expect(menu).toHaveCount(0)
    }
  })
}

test('ui: Create menu stays inside a short desktop viewport (1360x600)', async () => {
  await page.setViewportSize({ width: 1360, height: 600 })
  await page.goto('/app/planner')
  const scope = page.locator('aside.lg\\:flex')
  await scope.getByRole('button', { name: 'Create new' }).click()
  const box = await scope.locator('div.fixed.z-\\[60\\]').boundingBox()
  expect(box!.y + box!.height).toBeLessThanOrEqual(600)
})

test('ui: bio editor phone preview fits a 360px phone', async () => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto(bioEditor)
  await expect(page.getByText('Preview', { exact: true })).toBeVisible()
  const o = await overflow(page)
  const phone = await page.locator('aside:has(> p:text-is("Preview")) > div').boundingBox()
  await page.screenshot({ path: `${SHOTS}/bio-editor-360.png`, fullPage: true })
  expect.soft(phone!.x + phone!.width, 'phone preview frame sticks out of the 360px viewport').toBeLessThanOrEqual(360)
  expect(o.sw, `bio editor wider than 360px: ${o.els.join(' | ')}`).toBeLessThanOrEqual(o.iw)
})

test('ui: public bio page has no horizontal scroll on a phone', async ({ browser }) => {
  // publish the responsive account's page with a very long unbroken word
  const id = bioEditor.split('/').pop()!
  const slug = sql(`select slug from "BioPage" where id='${id}'`)
  sql(
    `update "BioPage" set published=true, bio='${'Supercalifragilistic'.repeat(6)}', blocks='[{"id":"l1","type":"link","title":"${'Averyveryverylongbuttontitle'.repeat(2)}","url":"https://example.com","enabled":true}]' where id='${id}'`,
  )
  const c = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const p = await c.newPage()
  await p.goto(`/b/${slug}`)
  const o = await overflow(p)
  if (o.sw > o.iw) await p.screenshot({ path: `${SHOTS}/overflow-375-public-bio-longword.png`, fullPage: true })
  await c.close()
  expect.soft(o.sw, `public bio page wider than 375px with a long word: ${o.els.join(' | ')}`).toBeLessThanOrEqual(o.iw)
})

// ── Accessibility quick pass ────────────────────────────────────────────────

async function a11yAudit(p: Page) {
  return p.evaluate(() => {
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'
    }
    const name = (el: Element) =>
      (el.getAttribute('aria-label') ?? '').trim() ||
      (el.getAttribute('aria-labelledby') ? 'x' : '') ||
      (el.getAttribute('title') ?? '').trim() ||
      (el.textContent ?? '').trim() ||
      Array.from(el.querySelectorAll('img[alt]')).map((i) => i.getAttribute('alt')).join('').trim()
    const desc = (el: Element) => `<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') ?? '').slice(0, 60)}">`
    const buttons = Array.from(document.querySelectorAll('button, a[href], [role=button]')).filter(vis).filter((b) => !name(b)).map(desc)
    const imgs = Array.from(document.querySelectorAll('img')).filter(vis).filter((i) => !i.hasAttribute('alt')).map((i) => `<img src="${i.getAttribute('src')?.slice(0, 60)}">`)
    const inputs = Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=file]), textarea, select'))
      .filter(vis)
      .filter((i) => {
        const id = i.getAttribute('id')
        return !(
          i.closest('label') ||
          (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
          i.getAttribute('aria-label') ||
          i.getAttribute('aria-labelledby') ||
          i.getAttribute('title')
        )
      })
      .map((i) => `<${i.tagName.toLowerCase()} name="${i.getAttribute('name') ?? ''}" placeholder="${i.getAttribute('placeholder') ?? ''}">`)
    const h1 = document.querySelectorAll('h1').length
    return { buttons: [...new Set(buttons)], imgs: [...new Set(imgs)], inputs: [...new Set(inputs)], h1 }
  })
}

test('ui a11y: auth pages — inputs labelled, buttons named, focus visible', async ({ browser }) => {
  const c = await browser.newContext()
  const p = await c.newPage()
  const report: Record<string, unknown> = {}
  for (const path of ['/login', '/signup', '/forgot-password']) {
    await p.goto(path)
    const a = await a11yAudit(p)
    report[path] = a
    expect.soft(a.inputs, `${path}: form inputs without a label (placeholder only)`).toEqual([])
    expect.soft(a.buttons, `${path}: unnamed buttons/links`).toEqual([])
    expect.soft(a.imgs, `${path}: images without alt`).toEqual([])
  }
  // password tab inputs too
  await p.goto('/login')
  await p.getByRole('button', { name: 'Password' }).click()
  const pw = await a11yAudit(p)
  expect.soft(pw.inputs, '/login password tab: inputs without a label').toEqual([])

  // focus visible on every tab stop of /login
  await p.goto('/login')
  const noRing: string[] = []
  for (let i = 0; i < 8; i++) {
    await p.keyboard.press('Tab')
    const f = await p.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body || el.tagName === 'NEXTJS-PORTAL') return null
      const s = getComputedStyle(el)
      const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'
      return { el: `${el.tagName} ${(el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 30)}`, ring }
    })
    if (f && !f.ring) noRing.push(f.el)
  }
  expect.soft(noRing, '/login: focused elements without a visible focus indicator').toEqual([])
  await c.close()
})

test('ui a11y: app pages — unnamed buttons/links, images without alt, unlabelled inputs', async () => {
  await page.setViewportSize({ width: 1360, height: 900 })
  const found: string[] = []
  for (const path of ['/', ...APP, bioEditor]) {
    await page.goto(path)
    await page.waitForLoadState('networkidle').catch(() => {})
    const a = await a11yAudit(page)
    if (a.buttons.length) found.push(`${path} unnamed buttons/links: ${a.buttons.join(', ')}`)
    if (a.imgs.length) found.push(`${path} img without alt: ${a.imgs.join(', ')}`)
    if (a.inputs.length) found.push(`${path} unlabelled inputs: ${a.inputs.join(', ')}`)
    if (a.h1 !== 1) found.push(`${path} has ${a.h1} <h1> elements`)
  }
  // Media picker tiles and mobile drawer
  await page.goto(bioEditor)
  await page.getByRole('button', { name: 'Add avatar' }).click()
  await page.getByRole('dialog', { name: 'Add images' }).locator('input[type=file]').setInputFiles({
    name: 'a.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  })
  await expect(page.getByRole('dialog').getByRole('button', { name: /Add 1 image/ })).toBeEnabled()
  const m = await a11yAudit(page)
  if (m.buttons.length) found.push(`MediaPicker dialog unnamed buttons: ${m.buttons.join(', ')}`)
  expect.soft(found).toEqual([])
})
