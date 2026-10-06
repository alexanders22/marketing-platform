import { createServer } from 'node:http'
import { expect, test, type Page } from '@playwright/test'
import { newAccount, sql } from './helpers'

// Website → AI search: readiness for AI crawlers (free) on a local site, and
// — with QA_CONTENT_AI=1 — real AI search answers for the company.

test.describe.configure({ mode: 'serial' })

const PORT = 18995
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
let home = ''
let robots = ''
let llms: string | null = null
const site = createServer((req, res) => {
  const path = req.url!.split('?')[0]
  const body = path === '/' ? home : path === '/robots.txt' ? robots : path === '/llms.txt' ? llms : null
  res.writeHead(body === null ? 404 : 200, { 'content-type': path === '/' ? 'text/html' : 'text/plain' })
  res.end(body ?? 'Not found')
})
let page: Page
let workspaceId = ''

test.beforeAll(async ({ browser }) => {
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()))
  page = await browser.newPage()
  const { brand } = await newAccount(page, 'geo', `Geo ${Date.now()}`)
  workspaceId = sql(`select id from "Workspace" where name='${brand}'`)
  sql(`update "BrandKit" set website='http://127.0.0.1:${PORT}/' where "workspaceId"='${workspaceId}'`)
})
test.afterAll(async () => {
  await page.close()
  await new Promise((r) => site.close(r))
})

const row = (label: string) => page.getByRole('list', { name: 'AI readiness checks' }).getByRole('listitem').filter({ hasText: label })

test('a JavaScript-only site that blocks ChatGPT search', async () => {
  home = '<html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>'
  robots = 'User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n'
  await page.goto('/app/website/ai')
  await expect(page.getByRole('button', { name: /Ask AI search · 5 credits/ })).toBeVisible()
  await page.getByRole('button', { name: 'Check the site' }).click()
  await expect(row('AI assistants may read the site')).toHaveAttribute('data-status', 'bad')
  await expect(row('AI assistants may read the site')).toContainText('blocks OAI-SearchBot')
  await expect(row('AI assistants may read the site')).not.toContainText('PerplexityBot')
  await expect(row('AI training crawlers')).toContainText('GPTBot')
  await expect(row('Text in the page code')).toHaveAttribute('data-status', 'bad')
  await expect(row('Who you are, in structured data')).toHaveAttribute('data-status', 'warn')
  await expect(row('llms.txt')).toHaveAttribute('data-status', 'info')
  await expect(page.getByRole('heading', { name: /Ready for AI crawlers · \d+\/100/ })).toBeVisible()
})

test('a well-prepared site passes', async () => {
  home = `<html lang="en"><head><title>Bloom</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Bakery","name":"Bloom","telephone":"+995 555 000000"}</script></head><body><h1>Bloom Bakery</h1><p>${words(300)}</p><h2>Frequently asked questions</h2><a href="tel:+995555000000">Call</a></body></html>`
  robots = 'User-agent: *\nAllow: /\n'
  llms = '# Bloom Bakery\n\nFresh bread in Tbilisi.\n'
  await page.getByRole('button', { name: 'Check again' }).click()
  for (const label of ['AI assistants may read the site', 'Text in the page code', 'Who you are, in structured data', 'Answers to common questions', 'Contact details on the page', 'llms.txt'])
    await expect(row(label)).toHaveAttribute('data-status', 'ok')
  await expect(page.getByRole('heading', { name: 'Ready for AI crawlers · 100/100' })).toBeVisible()
})

test('visibility in real AI search answers', async () => {
  test.skip(!process.env.QA_CONTENT_AI, 'set QA_CONTENT_AI=1 to call Gemini with Google Search')
  test.setTimeout(240_000)
  sql(`update "BrandKit" set description='A bakery in Tbilisi, Georgia: fresh bread, croissants and birthday cakes to order.' where "workspaceId"='${workspaceId}'`)
  const balance = () => Number(sql(`select a."creditBalance" from "Account" a join "Workspace" w on w."accountId"=a.id where w.id='${workspaceId}'`))
  const before = balance()
  await page.getByRole('button', { name: /Ask AI search/ }).click()
  await expect(page.getByLabel('AI visibility')).toBeVisible({ timeout: 220_000 })
  expect(await page.getByRole('list', { name: 'Questions' }).getByRole('listitem').count()).toBeGreaterThanOrEqual(3)
  await expect(page.getByRole('list', { name: 'Sources' })).toBeVisible()
  expect(balance()).toBe(before - 5)
})
