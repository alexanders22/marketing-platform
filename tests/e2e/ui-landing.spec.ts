import { expect, test, type Page } from '@playwright/test'

// Public landing page (/): sections, anchors, pricing toggle, CTAs, mobile menu.

function watch(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('response', (r) => {
    const own = r.url().startsWith('http://localhost:3100')
    if (r.status() >= 500 || (own && r.status() >= 400)) problems.push(`${r.status()} ${r.url()}`)
  })
  page.on('requestfailed', (r) => {
    if (!/net::ERR_ABORTED/.test(r.failure()?.errorText ?? '')) problems.push(`failed ${r.url()} ${r.failure()?.errorText}`)
  })
  return problems
}

const noHScroll = (page: Page) =>
  page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))

test('landing: all sections render, no console/page/network errors', async ({ page }) => {
  const problems = watch(page)
  const res = await page.goto('/')
  expect(res?.status()).toBe(200)
  for (const id of ['how', 'features', 'partners', 'ads', 'pricing', 'contact']) {
    await expect(page.locator(`section#${id}`), id).toHaveCount(1)
  }
  await expect(page.locator('header')).toBeVisible()
  await expect(page.locator('footer')).toBeVisible()
  await expect(page.locator('h1')).toHaveCount(1)
  // scroll through the page so lazy content loads
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 30))
    }
  })
  await page.waitForLoadState('networkidle')
  expect(problems).toEqual([])
})

test('landing: header mega menu opens panels and links to real pages', async ({ page }) => {
  await page.goto('/')
  const nav = page.locator('header nav[aria-label="Main"]')
  await nav.getByRole('button', { name: 'Features', exact: true }).hover()
  const features = page.locator('#menu-features a')
  await expect(features).toHaveCount(8)
  const hrefs = await features.evaluateAll((as) => as.map((a) => a.getAttribute('href')!))
  for (const h of hrefs) {
    expect(h).toMatch(/^\/features\/[a-z]+$/)
    expect((await page.request.get(h)).status()).toBe(200)
  }
  await page.keyboard.press('Escape')
  await expect(page.locator('#menu-features')).toHaveCount(0)
  await nav.getByRole('button', { name: 'Integrations', exact: true }).click()
  await expect(page.locator('#menu-integrations')).toContainText('Instagram')
  await nav.getByRole('button', { name: 'Resources', exact: true }).click()
  await expect(page.locator('#menu-resources')).toContainText('Partner API')
  await page.keyboard.press('Escape')
  await nav.getByRole('link', { name: 'Pricing' }).click()
  await expect(page).toHaveURL(/#pricing$/)
  await expect(page.locator('section#pricing')).toBeInViewport()
})

test('landing: every in-page anchor points at an existing element', async ({ page }) => {
  await page.goto('/')
  const anchors = await page.$$eval('a[href^="#"]', (as) =>
    as.map((a) => ({ href: a.getAttribute('href')!, text: (a.textContent ?? '').trim(), ok: a.getAttribute('href') === '#' || !!document.querySelector(a.getAttribute('href')!) })),
  )
  expect(anchors.filter((a) => !a.ok)).toEqual([])
  // Placeholder links that go nowhere (href="#") — reported, not fatal for the anchor check above.
  const dead = anchors.filter((a) => a.href === '#' && a.text && a.text !== 'Khma').map((a) => a.text)
  expect.soft(dead, 'footer/other links with href="#" go nowhere').toEqual([])
})

test('landing: contact / demo CTAs lead to a way to contact', async ({ page }) => {
  await page.goto('/')
  // "Book a demo" and "Let's talk" both link to #contact; the #contact section should offer a form, email or booking link.
  const contact = page.locator('section#contact')
  const ways = await contact.locator('form, a[href^="mailto:"], a[href^="tel:"], a[href^="http"], input, textarea').count()
  expect.soft(ways, '#contact section has no form, email, phone or booking link — "Book a demo"/"Let\'s talk" jump to a section that just repeats the CTA').toBeGreaterThan(0)
})

test('landing: pricing monthly / yearly toggle', async ({ page }) => {
  await page.goto('/#pricing')
  const pricing = page.locator('section#pricing')
  const prices = pricing.locator('span.text-4xl')
  await expect(pricing.getByRole('button', { name: 'Monthly' })).toHaveAttribute('aria-pressed', 'true')
  await expect(prices).toHaveText(['$29', '$79', '$199'])
  await expect(pricing.getByText('Billed monthly')).toHaveCount(3)
  await pricing.getByRole('button', { name: /Yearly/ }).click()
  await expect(pricing.getByRole('button', { name: /Yearly/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(prices).toHaveText(['$24', '$66', '$166'])
  await expect(pricing.getByText(/Billed yearly/)).toHaveText(['Billed yearly — $290', 'Billed yearly — $790', 'Billed yearly — $1,990'])
  await pricing.getByRole('button', { name: 'Monthly' }).click()
  await expect(prices).toHaveText(['$29', '$79', '$199'])
})

test('landing: CTAs go to /signup and /login', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('header').getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  await expect(page.locator('header').getByRole('link', { name: 'Try free' })).toHaveAttribute('href', '/signup')
  const trial = page.locator('section#pricing').getByRole('link', { name: 'Start free trial' })
  await expect(trial).toHaveCount(3)
  for (const h of await trial.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) expect(h).toBe('/signup')
  const external = await page.$$eval('a[href]', (as) =>
    // mailto: is the intended contact channel for demo / partnership / support.
    as.map((a) => a.getAttribute('href')!).filter((h) => !h.startsWith('#') && !h.startsWith('/#') && !h.startsWith('/features/') && !h.startsWith('mailto:') && !['/', '/signup', '/login'].includes(h)),
  )
  expect(external).toEqual([])
  await page.locator('header').getByRole('link', { name: 'Try free' }).click()
  await expect(page).toHaveURL(/\/signup$/)
  await expect(page.getByRole('heading', { name: 'Sign up to continue' })).toBeVisible()
  await page.goto('/')
  await page.locator('header').getByRole('link', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Log in to continue' })).toBeVisible()
})

test.describe('landing mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('landing: mobile menu opens, navigates and closes; no horizontal scroll at 375px', async ({ page }) => {
    const problems = watch(page)
    await page.goto('/')
    const { sw, iw } = await noHScroll(page)
    expect(sw, 'horizontal scroll at 375px').toBeLessThanOrEqual(iw)
    await expect(page.locator('header nav.md\\:flex')).toBeHidden()
    const toggle = page.getByRole('button', { name: 'Open menu' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    const menu = page.locator('header nav.md\\:hidden')
    await expect(menu.getByRole('link', { name: 'Pricing' })).toBeVisible()
    await expect(menu.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
    await expect(menu.getByRole('link', { name: 'Try free' })).toHaveAttribute('href', '/signup')
    await menu.getByRole('link', { name: 'Pricing' }).click()
    await expect(menu).toHaveCount(0)
    await expect(page).toHaveURL(/#pricing$/)
    await expect(page.locator('section#pricing h2')).toBeInViewport()
    // pricing toggle fits
    await page.locator('section#pricing').getByRole('button', { name: /Yearly/ }).click()
    await expect(page.locator('section#pricing span.text-4xl').first()).toHaveText('$24')
    // close via the X button
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('button', { name: 'Close menu' }).click()
    await expect(menu).toHaveCount(0)
    // scroll whole page and re-check overflow
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const after = await noHScroll(page)
    expect(after.sw).toBeLessThanOrEqual(after.iw)
    expect(problems).toEqual([])
  })

  test('landing: no element wider than the 320px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/')
    const wide = await page.evaluate(() => {
      const iw = window.innerWidth
      const out: string[] = []
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.right > iw + 1 && getComputedStyle(el).position !== 'fixed') {
          // ignore elements inside a horizontally scrollable / clipped ancestor
          let p = el.parentElement
          let clipped = false
          while (p && p !== document.body) {
            const ox = getComputedStyle(p).overflowX
            if (ox !== 'visible' && !p.classList.contains('overflow-x-clip')) { clipped = true; break }
            p = p.parentElement
          }
          if (!clipped) out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ').slice(0, 3).join('.')} right=${Math.round(r.right)}`)
        }
      }
      return { sw: document.documentElement.scrollWidth, iw, out: out.slice(0, 10) }
    })
    expect(wide.sw, 'document wider than viewport at 320px').toBeLessThanOrEqual(wide.iw)
    expect.soft(wide.out, 'elements sticking out of the 320px viewport (hidden by overflow-x-clip on the root)').toEqual([])
  })
})
