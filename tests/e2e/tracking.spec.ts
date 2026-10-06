import { createServer } from 'node:http'
import { expect, test, type Page } from '@playwright/test'
import { startFakeMeta } from './fake-meta'
import { newAccount, sql } from './helpers'

// Website → Tracking: Meta Pixel in the page code, the pixel's browser and
// server (Conversions API) events from the ad account, Google tags. The
// website is a tiny local server (allowed by KHMA_FETCH_ALLOW in dev only).

test.describe.configure({ mode: 'serial' })

const SITE_PORT = 18997
let html = ''
const site = createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(html)
})
const meta = startFakeMeta()
let page: Page
let workspaceId = ''

const PIXEL = `<script>fbq('init', '1234567890123456'); fbq('track', 'PageView');</script>`

test.beforeAll(async ({ browser }) => {
  await new Promise<void>((r) => site.listen(SITE_PORT, '127.0.0.1', () => r()))
  page = await browser.newPage()
  await newAccount(page, 'track')
  workspaceId = sql(`select w.id from "Workspace" w join "BrandKit" b on b."workspaceId"=w.id order by w."createdAt" desc limit 1`)
  sql(`update "BrandKit" set website='http://127.0.0.1:${SITE_PORT}/' where "workspaceId"='${workspaceId}'`)
})
test.afterAll(async () => {
  await page.close()
  await new Promise((r) => site.close(r))
})

const checks = () => page.getByRole('list', { name: 'Tracking checks' })
const row = (label: string | RegExp) => checks().getByRole('listitem').filter({ hasText: label })

test('a site without a pixel: what is missing and how to install it', async () => {
  html = '<html><head><title>Bloom</title></head><body>Hello</body></html>'
  await page.goto('/app/website/tracking')
  await page.getByRole('button', { name: 'Run the check' }).click()
  await expect(row('Meta Pixel on the website')).toHaveAttribute('data-status', 'bad')
  await expect(row('Pixel in your ad account')).toContainText('Connect your Meta ad account')
  await expect(row('Google Analytics 4')).toHaveAttribute('data-status', 'warn')
  await page.getByText('How to install the Meta Pixel and the Conversions API').click()
  await expect(page.getByText("fbq('init', 'YOUR_PIXEL_ID')")).toBeVisible()
})

test('with an ad account: the pixel fires, but no server events', async () => {
  await meta.listen()
  try {
    await page.goto('/app/channels')
    await page.locator('a[href="/auth/meta"]').click()
    await page.waitForURL(/\/app\/channels\?connected=/)
    html = `<html><head>${PIXEL}<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC1234567"></script></head><body></body></html>`
    await page.goto('/app/website/tracking')
    await page.getByRole('button', { name: 'Check again' }).click()
    await expect(row('Meta Pixel on the website')).toContainText('Pixel 1234567890123456 is in the page code.')
    await expect(row('Bloom pixel fires')).toHaveAttribute('data-status', 'ok')
    await expect(row('Bloom pixel fires')).toContainText('510 browser events')
    await expect(row('Conversion events')).toContainText('Tracked: Lead.')
    await expect(row('Conversions API')).toHaveAttribute('data-status', 'warn')
    await expect(row('Google Analytics 4')).toContainText('G-ABC1234567')
    const table = page.getByRole('table', { name: 'Pixel events' })
    await expect(table.getByRole('row').filter({ hasText: 'PageView' })).toContainText('500')

    // Conversions API on: server events counted, and a reminder about event_id.
    meta.setServerEvents(true)
    await page.getByRole('button', { name: 'Check again' }).click()
    await expect(row('Conversions API')).toHaveAttribute('data-status', 'ok')
    await expect(row('Conversions API')).toContainText('9 server events')
    await expect(row('Conversions API')).toContainText('event_id')

    const stats = meta.calls.filter((c) => c.path === '/1234567890123456/stats')
    expect(stats.map((c) => c.params.event_source)).toEqual(expect.arrayContaining(['WEB_ONLY', 'SERVER_ONLY']))
    expect(Number(sql(`select count(*) from "WebsiteAudit" where "workspaceId"='${workspaceId}' and kind='TRACKING'`))).toBe(3)
  } finally {
    await meta.close()
  }
})

test('a pixel the ad account cannot see is flagged', async () => {
  // Pixel from another business on the site; GTM present.
  html = `<html><head><script>fbq('init','999999999999');</script><script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-AB12CD');</script></head></html>`
  await meta.listen()
  try {
    await page.goto('/app/website/tracking')
    await page.getByRole('button', { name: 'Check again' }).click()
    await expect(row('Pixel in your ad account')).toHaveAttribute('data-status', 'warn')
    await expect(row('Pixel in your ad account')).toContainText('999999999999')
  } finally {
    await meta.close()
  }
})
