// Full-page screenshots of app pages for design review (local dev only).
// Usage: node scripts/design-shots.mjs <email> <workspaceId> <outDir> [path …]
import { chromium } from '@playwright/test'

const [email, ws, out, ...paths] = process.argv.slice(2)
const BASE = 'http://localhost:3100'
const MAILPIT = 'http://localhost:18025'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto(`${BASE}/signup`)
await page.getByPlaceholder('name@company.com').fill(email)
const t0 = Date.now() - 2000
await page.getByRole('button', { name: 'Send magic link' }).click()
let link = null
for (let i = 0; i < 40 && !link; i++) {
  const r = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=1`)).json()
  if (r.messages?.[0] && Date.parse(r.messages[0].Created) > t0) {
    const m = await (await fetch(`${MAILPIT}/api/v1/message/${r.messages[0].ID}`)).json()
    link = m.Text.match(/https?:\/\/[^\s"']+\/auth\/magic\?token=[^\s"']*/)?.[0]
  }
  if (!link) await new Promise((r) => setTimeout(r, 500))
}
if (!link) throw new Error('no sign-in email')
await page.goto(link)
await page.getByRole('button', { name: 'Continue' }).click()
await page.waitForURL(/\/app/)
await ctx.addCookies([{ name: 'khma_ws', value: ws, url: BASE }])
for (const p of paths.length ? paths : ['/app/dashboard', '/app/weekly', '/app/goals']) {
  await page.goto(`${BASE}${p}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  const file = `${out}/${p.replace(/\//g, '_').replace(/^_/, '')}.png`
  await page.screenshot({ path: file, fullPage: true })
  console.log(file)
}
await browser.close()
