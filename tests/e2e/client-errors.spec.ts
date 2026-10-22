import { expect, test } from '@playwright/test'
import { newAccount } from './helpers'

// Browser errors reach the server log, and a tab left on the previous build
// (its scripts or Server Action ids gone after a deploy) reloads once by
// itself instead of showing "This page couldn't load".

test('a stale-build error reloads the page once and is reported', async ({ page }) => {
  await newAccount(page, 'cerr')
  await page.goto('/app/planner')
  // (The report goes by sendBeacon, whose body Playwright can't read: its content shows in the server log.)
  const reports: string[] = []
  page.on('request', (r) => r.url().endsWith('/api/client-errors') && reports.push(r.method()))

  const stale = () => window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: Object.assign(new Error('Loading chunk 123 failed.'), { name: 'ChunkLoadError' }) }))
  await Promise.all([page.waitForEvent('load'), page.evaluate(stale)])
  await expect.poll(() => reports).toEqual(['POST'])

  // Again within a minute: reported, but no reload loop.
  let reloaded = false
  page.once('load', () => (reloaded = true))
  await page.evaluate(stale)
  await expect.poll(() => reports.length).toBe(2)
  await page.waitForTimeout(1000)
  expect(reloaded).toBe(false)
})

test('the error log takes a report and ignores junk', async ({ request }) => {
  expect((await request.post('/api/client-errors', { data: { where: 'app', message: 'x'.repeat(5000) } })).status()).toBe(204)
  expect((await request.post('/api/client-errors', { data: 'not json', headers: { 'content-type': 'text/plain' } })).status()).toBe(204)
})

// A Server Action whose request fails on the way (offline, a laptop waking up,
// a 502 while the server restarts for a deploy) used to leave the page on
// "This page couldn't load" until a manual reload.
for (const fail of ['network', '502'] as const) {
  test(`a dropped action request (${fail}) reconnects by itself`, async ({ page }) => {
    await newAccount(page, `drop${fail}`)
    await page.goto('/app/credits')
    let failed = 0
    await page.route('**/app/credits', (route) => {
      const r = route.request()
      if (r.method() !== 'POST' || !r.headers()['next-action'] || failed > 0) return route.continue()
      failed++
      return fail === 'network' ? route.abort('internetdisconnected') : route.fulfill({ status: 502, contentType: 'text/html', body: '<html><body>502 Bad Gateway</body></html>' })
    })
    await page.getByRole('list', { name: 'Credit packs' }).getByRole('button', { name: 'Buy' }).first().click()
    await expect(page.getByText('Connection lost — reconnecting…')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Buy more credits' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/This page couldn.t load/)).toHaveCount(0)
    // The lost click is not dropped silently.
    await expect(page.getByText(/your last action may not have gone through/)).toBeVisible()
    expect(failed).toBe(1)
  })
}
