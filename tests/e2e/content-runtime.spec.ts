import { expect, test, type Page } from '@playwright/test'
import { newAccount, sql } from './helpers'

// Runtime health: no idle refresh loop, and Planner / post editor behave for
// a browser in another time zone than the server (+04).

// Visible text of the Next.js dev overlay / issues badge (empty when none).
const overlayText = (p: Page) =>
  p.evaluate(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot
      if (!root) return ''
      const out: string[] = []
      const walk = (n: Node) => {
        if (n.nodeType === 3 && n.parentElement?.tagName !== 'STYLE' && n.textContent?.trim()) out.push(n.textContent.trim())
        n.childNodes.forEach(walk)
      }
      walk(root)
      return out.join(' | ').slice(0, 600)
    })

test('no idle refresh loop on /app/create, /app/campaigns, /app/campaigns/new, /app/planner', async ({ page }) => {
  await newAccount(page, 'qa-content-idle')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`))

  const report: Record<string, string[]> = {}
  for (const path of ['/app/create', '/app/campaigns', '/app/campaigns/new?kind=social', '/app/planner']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1500)
    const hits: string[] = []
    const onReq = (r: import('@playwright/test').Request) => {
      const u = new URL(r.url())
      const h = r.headers()
      const isDoc = r.resourceType() === 'document'
      const isRsc = u.searchParams.has('_rsc') || h['rsc'] === '1' || h['next-router-state-tree'] !== undefined
      const isAction = r.method() === 'POST' && h['next-action'] !== undefined
      if (isDoc || isRsc || isAction) hits.push(`${r.method()} ${u.pathname}${u.search} ${r.resourceType()}`)
    }
    page.on('request', onReq)
    await page.waitForTimeout(10_000)
    page.off('request', onReq)
    report[path] = hits
    expect.soft(await overlayText(page), `${path}: Next dev overlay issues`).toBe('')
  }
  // Other content pages: dev overlay must stay clean in the server's own time zone.
  for (const path of ['/app/posts/new', '/app/posts/new?date=2026-10-20', '/app/planner?view=list', '/app/blog/new', '/app/blog/ai']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1000)
    expect.soft(await overlayText(page), `${path}: Next dev overlay issues`).toBe('')
  }
  console.log('idle page/RSC requests per page:', JSON.stringify(report, null, 1))
  for (const [path, hits] of Object.entries(report)) expect.soft(hits.length, `${path}: ${hits.join(', ')}`).toBeLessThanOrEqual(2)
  expect.soft(errors).toEqual([])
})

test.describe('browser in America/Los_Angeles (server is +04)', () => {
  test.use({ timezoneId: 'America/Los_Angeles' })

  test('planned post shows on the right local day/time without hydration errors; editor keeps the local time', async ({ page }) => {
    await newAccount(page, 'qa-content-tz')
    const hydration: string[] = []
    const watch = (p: Page) =>
      p.on('console', (m) => m.type() === 'error' && /hydrat|did not match|didn't match/i.test(m.text()) && hydration.push(`${p.url()}: ${m.text().slice(0, 400)}`))
    watch(page)

    await page.goto('/app/posts/new?date=2026-10-15')
    await expect(page.locator('input[type=datetime-local]')).toHaveValue('2026-10-15T10:00')
    await page.getByPlaceholder('What do you want to share?').fill('QA TZ post')
    await page.locator('input[type=datetime-local]').fill('2026-10-15T14:30') // 21:30Z = 01:30 on the 16th at +04
    await page.getByRole('button', { name: 'Save to planner' }).click()
    await expect(page).toHaveURL(/\/app\/posts\/c[a-z0-9]+$/)
    const id = page.url().split('/').pop()!

    // Fresh server render of the editor.
    await page.goto(`/app/posts/${id}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    const shown = await page.locator('input[type=datetime-local]').inputValue()
    const editorOverlay = await overlayText(page)
    console.log('editor overlay:', editorOverlay)
    expect.soft(editorOverlay, 'post editor: Next dev overlay issues').not.toMatch(/Hydration|hydrat/i)
    expect.soft(shown, 'editor shows the time the user picked (re-saving must not shift it)').toBe('2026-10-15T14:30')

    // Re-save without touching the date: the stored instant must not move.
    await page.getByRole('button', { name: 'Save to planner' }).click()
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()
    expect.soft(sql(`select to_char("scheduledAt",'YYYY-MM-DD HH24:MI') from "Post" where id='${id}'`)).toBe('2026-10-15 21:30')

    const all: string[] = []
    page.on('console', (m) => all.push(`${m.type()}: ${m.text().slice(0, 200)}`))
    const ssr = await (await page.request.get('/app/planner?m=2026-10')).text()
    console.log('SSR has "14:30":', ssr.includes('>14:30<'), ' SSR has "01:30":', ssr.includes('>01:30<'))
    await page.goto('/app/planner?m=2026-10')
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1500)
    console.log('planner console:', JSON.stringify(all))
    const overlay = await overlayText(page)
    console.log('next dev overlay:', overlay)
    // Server HTML is rendered in the server's zone: post lands on Oct 16 01:30 until React re-renders on the client.
    expect.soft(ssr.includes('>01:30<'), 'SSR planner renders server-TZ time (hydration mismatch)').toBe(false)
    expect.soft(overlay, 'Next dev overlay reports issues').not.toMatch(/Hydration|hydrat/i)
    const cell = (d: string) => page.locator('div.group').filter({ has: page.getByLabel(`New post on ${d}`, { exact: true }) })
    await expect.soft(cell('2026-10-15').getByText('QA TZ post')).toBeVisible()
    await expect.soft(cell('2026-10-15').getByText('14:30')).toBeVisible()
    await expect.soft(cell('2026-10-16').getByText('QA TZ post')).toHaveCount(0)

    expect(hydration, 'hydration mismatches').toEqual([])
  })
})
