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
