import { createServer } from 'node:http'
import { expect, test, type Page } from '@playwright/test'
import { startFakeGoogle } from './fake-google'
import { newAccount, sql } from './helpers'

// Website → SEO: a technical read of the pages, robots.txt and sitemap, a
// score, and Google Search Console (connected through the fake Google) with
// the searches that are almost on page one. The website is a local server
// (allowed by KHMA_FETCH_ALLOW in dev only).

test.describe.configure({ mode: 'serial' })

const PORT = 18996
let robots = 'User-agent: *\nAllow: /\nSitemap: http://127.0.0.1:18996/sitemap.xml\n'
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const pages: Record<string, string> = {
  // Home: no description, two H1s, an image without alt, no viewport, no structured data.
  '/': `<html><head><title>Bloom Bakery — fresh bread and cakes in Tbilisi</title></head><body><h1>Bloom</h1><h1>Bakery</h1><img src="a.jpg"><p>${words(300)}</p><a href="/cakes">Cakes</a> <a href="/about">About</a></body></html>`,
  '/cakes': `<html lang="en"><head><title>Birthday cakes to order in Tbilisi | Bloom Bakery</title><meta name="description" content="Order a birthday cake in Tbilisi: 40 designs, gluten-free options, delivery across the city the same day. See prices and order online."><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="http://127.0.0.1:18996/cakes"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Bakery","name":"Bloom"}</script></head><body><h1>Birthday cakes</h1><img src="c.jpg" alt="Chocolate cake"><p>${words(400)}</p></body></html>`,
  '/about': `<html lang="en"><head><title>About</title><meta name="viewport" content="width=device-width"></head><body><h1>About us</h1><p>Short.</p></body></html>`,
  '/sitemap.xml': '<?xml version="1.0"?><urlset><url><loc>http://127.0.0.1:18996/</loc></url></urlset>',
}
const site = createServer((req, res) => {
  const path = req.url!.split('?')[0]
  if (path === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    return res.end(robots)
  }
  const body = pages[path]
  res.writeHead(body ? 200 : 404, { 'content-type': path.endsWith('.xml') ? 'application/xml' : 'text/html' })
  res.end(body ?? 'Not found')
})
const google = startFakeGoogle()
let page: Page
let workspaceId = ''

test.beforeAll(async ({ browser }) => {
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()))
  page = await browser.newPage()
  const { brand } = await newAccount(page, 'seo', `Seo ${Date.now()}`)
  workspaceId = sql(`select id from "Workspace" where name='${brand}'`)
  sql(`update "BrandKit" set website='http://127.0.0.1:${PORT}/' where "workspaceId"='${workspaceId}'`)
})
test.afterAll(async () => {
  await page.close()
  await new Promise((r) => site.close(r))
})

const row = (label: string) => page.getByRole('list', { name: 'SEO checks' }).getByRole('listitem').filter({ hasText: label })

test('page check without Search Console: score, findings and fixes', async () => {
  await page.goto('/app/website')
  await expect(page.getByRole('link', { name: 'Connect Search Console' })).toBeVisible()
  await page.getByRole('button', { name: 'Run the check' }).click()
  await expect(page.getByLabel('SEO score')).toBeVisible()
  // Home + the two pages it links to.
  const checked = page.getByRole('table', { name: 'Pages checked' })
  await expect(checked.getByRole('row')).toHaveCount(4)
  await expect(row('robots.txt')).toHaveAttribute('data-status', 'ok')
  await expect(row('Sitemap')).toHaveAttribute('data-status', 'ok')
  await expect(row('Meta descriptions')).toContainText('/ and /about have no description')
  await expect(row('Main heading (H1)')).toContainText('2 H1 headings')
  await expect(row('Mobile friendly')).toHaveAttribute('data-status', 'bad')
  await expect(row('Image descriptions (alt)')).toContainText('1 of 2 images have no alt text')
  await expect(row('Structured data')).toContainText('Found: Bakery')
  await expect(row('Amount of text')).toContainText('/about')
  await expect(row('Page titles')).toContainText('/about: title is 5 characters')
  const score = Number((await page.getByLabel('SEO score').innerText()).split('/')[0])
  expect(score).toBeGreaterThan(40)
  expect(score).toBeLessThan(90)
})

test('robots.txt that shuts Google out is a red flag', async () => {
  robots = 'User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nDisallow: /\n'
  try {
    await page.getByRole('button', { name: 'Check again' }).click()
    await expect(row('robots.txt')).toHaveAttribute('data-status', 'bad')
  } finally {
    robots = 'User-agent: *\nAllow: /\n'
  }
})

test('Search Console: searches, trend and the ones almost on page one', async () => {
  await google.listen()
  try {
    await page.getByRole('link', { name: 'Connect Search Console' }).click()
    await page.waitForURL(/\/app\/website\?connected=1/)
    await expect(page.getByText('Search Console connected.')).toBeVisible()
    // The site for the brand's website is picked; unverified ones are left out.
    const picker = page.getByLabel('Search Console site')
    await expect(picker).toHaveValue('sc-domain:127.0.0.1')
    await expect(picker.locator('option')).toHaveCount(2)
    expect(sql(`select array_to_string(scopes, ' ') from "SocialAccount" where "workspaceId"='${workspaceId}' and network='SEARCH_CONSOLE'`)).toContain('webmasters.readonly')
    expect(sql(`select "refreshTokenEnc" from "SocialAccount" where "workspaceId"='${workspaceId}' and network='SEARCH_CONSOLE'`)).not.toContain('fake-refresh')

    await page.getByRole('button', { name: 'Check again' }).click()
    await expect(row('Clicks from Google')).toContainText('140 clicks in 28 days (+25%)')
    await expect(row('Almost on page one')).toContainText('“fresh bread tbilisi”')
    await expect(row('Almost on page one')).toContainText('“birthday cake order”')
    await expect(row('Seen but rarely clicked')).toContainText('“croissant near me”')
    const striking = page.getByRole('table', { name: 'Search' })
    await expect(striking.getByRole('row')).toHaveCount(3)
    await expect(page.getByRole('table', { name: 'Query' }).getByRole('row').filter({ hasText: 'bloom bakery' })).toContainText('120')
    // Pages that search brings people to are the ones checked.
    await expect(page.getByRole('table', { name: 'Pages checked' }).getByRole('row').filter({ hasText: '/cakes' })).toBeVisible()
    expect(google.scQueries.map((q) => q.site)).toContain('sc-domain:127.0.0.1')
    expect(google.scQueries.find((q) => (q.body.dimensions as string[])[0] === 'query')!.body.rowLimit).toBe(250)

    // Another site can be picked.
    await picker.selectOption('https://other.example/')
    await expect(picker).toHaveValue('https://other.example/')
    await expect.poll(() => sql(`select "externalId" from "SocialAccount" where "workspaceId"='${workspaceId}' and network='SEARCH_CONSOLE'`)).toBe('https://other.example/')
  } finally {
    await google.close()
  }
})

test('the AI action plan, in the chosen language (real AI)', async () => {
  test.skip(!process.env.QA_CONTENT_AI, 'set QA_CONTENT_AI=1 to call Gemini')
  test.setTimeout(150_000)
  await page.goto('/app/website')
  const before = Number(sql(`select a."creditBalance" from "Account" a join "Workspace" w on w."accountId"=a.id where w.id='${workspaceId}'`))
  await page.getByLabel('Plan language').selectOption('Russian')
  await page.getByRole('button', { name: /Write the action plan · 2 credits/ }).click()
  const plan = page.getByLabel('SEO action plan')
  await expect(plan).toBeVisible({ timeout: 120_000 })
  expect(await plan.getByRole('listitem').count()).toBeGreaterThanOrEqual(4)
  await expect(plan).toContainText(/[а-яА-Я]{4}/)
  expect(Number(sql(`select a."creditBalance" from "Account" a join "Workspace" w on w."accountId"=a.id where w.id='${workspaceId}'`))).toBe(before - 2)
})
