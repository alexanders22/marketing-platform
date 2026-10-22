import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { newAccount } from './helpers'

// Coming back from the card payment keeps you signed in. Monrem's page is
// another site: when it sends the payment frame (or a form POST) back to us,
// the browser leaves the SameSite=Lax session cookie out. The return page
// needs no session and moves the whole tab on by itself.

const PORT = 18998
// "Monrem": 127.0.0.1 is another site than localhost for the browser.
const OTHER = `http://127.0.0.1:${PORT}`
let server: Server

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, OTHER)
    const to = url.searchParams.get('to') ?? '/'
    // /go?to=… redirects, as Monrem does after paying; /post?to=… sends a form.
    if (url.pathname === '/go') {
      res.writeHead(302, { location: to })
      return res.end()
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><form method="post" action="${to}"><input name="status" value="APPROVED"></form><script>document.forms[0].submit()</script>`)
  })
  await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', () => r()))
})
test.afterAll(() => new Promise<void>((r) => server.close(() => r())))

// Opens `src` in a frame on our credits page, like the payment window.
async function inFrame(page: import('@playwright/test').Page, src: string) {
  await page.goto('/app/credits')
  await page.evaluate((s) => {
    const f = document.createElement('iframe')
    f.name = 'pay'
    f.src = s
    document.body.append(f)
  }, src)
}

test('a payment started before the fix (returning to /app/credits by POST) also lands signed in', async ({ page }) => {
  await newAccount(page, 'payret-old')
  // Without the bounce this went to the login page: no cookie on a cross-site POST.
  await page.goto(`${OTHER}/post?to=${encodeURIComponent('http://localhost:3100/app/credits?payment=abc')}`)
  await page.waitForURL(/\/app\/credits\?payment=abc&back=1$/)
  await expect(page.getByRole('heading', { name: 'Plan & credits' })).toBeVisible()
})

test('signed out for real: the credits page still asks to log in', async ({ browser }) => {
  const page = await browser.newPage()
  await page.goto('/app/credits?payment=abc')
  await page.waitForURL(/\/login$/)
  await page.close()
})

test('the return page takes the whole tab to the credits page, still signed in', async ({ page }) => {
  await newAccount(page, 'payret-frame')
  await inFrame(page, `${OTHER}/go?to=${encodeURIComponent('http://localhost:3100/pay/done?payment=abc')}`)
  await page.waitForURL(/\/app\/credits\?payment=abc&back=1$/)
  await expect(page.getByRole('heading', { name: 'Plan & credits' })).toBeVisible()
})

test('a form POST back from the payment page also lands signed in', async ({ page }) => {
  await newAccount(page, 'payret-post')
  await page.goto(`${OTHER}/post?to=${encodeURIComponent('http://localhost:3100/pay/done?payment=xyz')}`)
  await page.waitForURL(/\/app\/credits\?payment=xyz&back=1$/)
  await expect(page.getByRole('heading', { name: 'Plan & credits' })).toBeVisible()
})

test('the return page only ever sends you to the credits page', async ({ page }) => {
  const res = await page.request.get('/pay/done?payment=%22%3E%3Cscript%3E')
  expect(res.status()).toBe(200)
  const html = await res.text()
  expect(html).toContain('"/app/credits"')
  expect(html).not.toContain('<script>"')
})
