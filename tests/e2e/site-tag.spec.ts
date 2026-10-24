import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { expect, test, type Page } from '@playwright/test'
import { startFakeGemini } from './fake-gemini'
import { startFakeMeta } from './fake-meta'
import { newAccount, sql } from './helpers'

// Loudpilot Tag and the website assistant, end to end: a company website
// (local server) with the tag, a visitor coming from a Meta ad, the reports,
// server-side events, the Conversions API, and the chat — answering, looking
// up an order through the company's own endpoint (signed), verified
// customers, red flags and the team's reply.
//
// The dev server runs with KHMA_FETCH_ALLOW=127.0.0.1:18990 (the company
// endpoint), GEMINI_API_KEY=fake and GEMINI_BASE_URL=http://127.0.0.1:18992.

test.describe.configure({ mode: 'serial' })

const SITE_PORT = 18991
const COMPANY_PORT = 18990
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
)
const cron = createHmac('sha256', `cron:${env.KHMA_ENCRYPTION_KEY}`).update('tick').digest('hex')
const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex')

let key = ''
let secret = ''
const site = createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(`<!doctype html><html><head><title>Bloom &amp; Co.</title>
<script async src="http://localhost:3100/t.js" data-site="${key}"></script></head>
<body><h1>Bloom &amp; Co.</h1>
<a href="tel:+995599000000" onclick="event.preventDefault()">Call us</a>
<form onsubmit="event.preventDefault()"><input name="name" placeholder="Name"><input type="email" name="email" placeholder="Email"><input type="hidden" name="lp_visitor_id"><button>Send</button></form>
</body></html>`)
})

// The company's data endpoint: checks Loudpilot's signature, answers order
// A-1001 only together with the right e-mail, and the signed-in customer's orders.
const calls: { valid: boolean; body: { action: string; params: Record<string, string>; customer: { id: string; verified: boolean } | null } }[] = []
const company = createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const sig = String(req.headers['x-loudpilot-signature'] ?? '')
  const t = sig.match(/t=(\d+)/)?.[1] ?? ''
  const valid = sig.includes(`v1=${hmac(secret, `${t}.${raw}`)}`)
  const body = JSON.parse(raw)
  calls.push({ valid, body })
  const send = (status: number, data: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(data))
  }
  if (!valid) return send(401, { error: 'bad signature' })
  if (body.action === 'order_status')
    return body.params.order_number === 'A-1001' && body.params.email_or_phone === 'nino@example.com' ? send(200, { status: 'Shipped', eta: 'today 18:00' }) : send(404, { error: 'not found' })
  if (body.action === 'my_orders' && body.customer?.verified) return send(200, { orders: [{ number: 'A-2002', status: 'Being packed' }] })
  return send(404, {})
})

const gemini = startFakeGemini()
const meta = startFakeMeta()
let page: Page
let visitor: Page
let ws = ''
const tick = () => page.request.post('/api/cron/tick', { headers: { 'x-khma-cron': cron } }).then((r) => r.json())
const names = () => sql(`select string_agg(distinct name, ',' order by name) from "TagEvent" e join "Site" s on s.id=e."siteId" where s."workspaceId"='${ws}'`)

test.beforeAll(async ({ browser }) => {
  await new Promise<void>((r) => site.listen(SITE_PORT, '127.0.0.1', () => r()))
  await new Promise<void>((r) => company.listen(COMPANY_PORT, '127.0.0.1', () => r()))
  await gemini.listen()
  await meta.listen()
  page = await browser.newPage()
  const { brand } = await newAccount(page, 'sitetag', `Bloom ${Date.now()}`)
  ws = sql(`select id from "Workspace" where name='${brand}'`)
  await page.goto('/app/website/tag')
  await expect(page.getByRole('heading', { name: 'Loudpilot Tag' })).toBeVisible()
  key = sql(`select key from "Site" where "workspaceId"='${ws}'`)
  await expect(page.getByText(`data-site="${key}"`)).toBeVisible()
  await page.getByRole('button', { name: 'Show' }).click()
  await expect(page.getByLabel('Site secret')).toHaveText(/^lpsec_[\w-]{30,}$/)
  secret = (await page.getByLabel('Site secret').textContent())!.trim()
  visitor = await browser.newPage()
  // Routing turns off the browser cache: /api/tag/config is cached for a minute.
  await visitor.route('**/api/tag/config*', (r) => r.continue())
})
test.afterAll(async () => {
  await page?.close()
  await visitor?.close()
  await gemini.close()
  await meta.close()
  await new Promise((r) => site.close(r))
  await new Promise((r) => company.close(r))
})

test('the tag records where a visit came from and what the person did', async () => {
  await visitor.goto(`http://127.0.0.1:${SITE_PORT}/?utm_source=facebook&utm_medium=paid&utm_campaign=Spring&fbclid=abc123`)
  await expect.poll(names).toContain('PageView')
  await visitor.getByText('Call us').click()
  await visitor.getByPlaceholder('Name').fill('Nino')
  await visitor.getByPlaceholder('Email').fill('nino@example.com')
  await visitor.getByRole('button', { name: 'Send' }).click()
  await visitor.evaluate(() => (window as unknown as { loudpilot: (...a: unknown[]) => void }).loudpilot('track', 'Purchase', { value: 120, currency: 'GEL', order_id: 'A-1001' }))
  await expect.poll(names).toBe('Contact,Lead,PageView,Purchase')

  // The hidden field carries the visitor id for the company's CRM.
  const vid = await visitor.locator('input[name=lp_visitor_id]').inputValue()
  expect(sql(`select "cookieId" from "Visitor" v join "Site" s on s.id=v."siteId" where s."workspaceId"='${ws}'`)).toBe(vid)
  expect(sql(`select concat_ws('|', source, medium, campaign, "clickKind", "clickId") from "Visit" v join "Site" s on s.id=v."siteId" where s."workspaceId"='${ws}'`)).toBe('facebook|paid|Spring|fbclid|abc123')
  expect(sql(`select contact from "Visitor" v join "Site" s on s.id=v."siteId" where s."workspaceId"='${ws}'`)).toBe('ni***@example.com')
  expect(sql(`select value || ' ' || currency from "TagEvent" e join "Site" s on s.id=e."siteId" where s."workspaceId"='${ws}' and name='Purchase'`)).toBe('120 GEL')

  await page.goto('/app/website/tag')
  const row = page.getByRole('table', { name: 'Sources' }).getByRole('row').filter({ hasText: 'facebook / paid' })
  await expect(row).toContainText('Spring')
  await expect(row.getByRole('cell').nth(2)).toHaveText('2') // Lead + Contact
  await expect(row.getByRole('cell').nth(3)).toHaveText('1')
  await expect(page.getByRole('list', { name: 'Journeys' })).toContainText('Nino')
  await page.getByRole('list', { name: 'Journeys' }).getByText('Nino').click()
  await expect(page.getByRole('list', { name: 'Journeys' })).toContainText('Came from facebook / paid · Spring')
})

test('server events: the site secret signs them, the person is found by e-mail', async () => {
  const send = (headers: Record<string, string>, data: unknown) => page.request.post('/api/tag/v1/events', { headers: { 'content-type': 'application/json', ...headers }, data })
  const body = { site: key, events: [{ name: 'Purchase', event_id: 'crm-1', email: 'Nino@Example.com', value: 300, currency: 'gel' }] }
  expect((await send({ authorization: 'Bearer lpsec_wrong' }, body)).status()).toBe(401)
  const ok = await send({ authorization: `Bearer ${secret}` }, body)
  expect(ok.status()).toBe(200)
  expect((await ok.json()).results).toEqual([{ event_id: 'crm-1', status: 'recorded', matched: true }])
  expect((await (await send({ authorization: `Bearer ${secret}` }, body)).json()).results[0].status).toBe('duplicate')

  const raw = JSON.stringify({ site: key, events: [{ name: 'generate_lead', event_id: 'crm-2', phone: '+995 599 11 22 33' }] })
  const t = Math.floor(Date.now() / 1000)
  const signed = await page.request.post('/api/tag/v1/events', { headers: { 'content-type': 'application/json', 'x-loudpilot-signature': `t=${t},v1=${hmac(secret, `${t}.${raw}`)}` }, data: raw })
  expect((await signed.json()).results[0]).toEqual({ event_id: 'crm-2', status: 'recorded', matched: false })
  expect(sql(`select name || ' ' || e.source from "TagEvent" e join "Site" s on s.id=e."siteId" where s."workspaceId"='${ws}' and "eventId"='crm-2'`)).toBe('Lead server')
})

test('conversions go to the Meta pixel through the Conversions API', async () => {
  await page.goto('/app/channels')
  await page.locator('a[href="/auth/meta"]').click()
  await page.waitForURL(/\/app\/channels\?connected=/)
  await page.goto('/app/website/tag')
  await page.getByLabel('Send conversions to my Meta pixel').check()
  await page.getByLabel('Pixel (dataset) id').fill('1234567890123456')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()

  await visitor.evaluate(() => (window as unknown as { loudpilot: (...a: unknown[]) => void }).loudpilot('track', 'Lead', { form: 'quiz' }))
  await expect.poll(() => sql(`select count(*) from "TagEvent" e join "Site" s on s.id=e."siteId" where s."workspaceId"='${ws}' and e.capi='pending'`)).toBe('1')
  const before = meta.calls.length
  // Other runs' leftovers may go out in the same tick.
  expect((await tick()).conversions).toBeGreaterThanOrEqual(1)
  const call = meta.calls.slice(before).findLast((c) => c.path === '/1234567890123456/events')!
  const [event] = JSON.parse(call.params.data)
  expect(event).toMatchObject({ event_name: 'Lead', action_source: 'website', custom_data: { form: 'quiz' } })
  expect(event.user_data.em).toEqual([createHash('sha256').update('nino@example.com').digest('hex')])
  expect(event.user_data.fbc).toMatch(/^fb\.1\.\d+\.abc123$/)
  expect(event.user_data.client_user_agent).toBeTruthy()
  expect(sql(`select e.capi || coalesce(e.ip, '-') from "TagEvent" e join "Site" s on s.id=e."siteId" where s."workspaceId"='${ws}' and name='Lead' and source='web' order by e."createdAt" desc limit 1`)).toBe('sent-')
})

const chat = () => visitor.getByRole('dialog', { name: 'Bloom helper' })
async function say(text: string) {
  await chat().getByRole('textbox').fill(text)
  await chat().getByRole('textbox').press('Enter')
}

test('the assistant answers, looks up an order through the company endpoint, and hands red flags over', async () => {
  await page.goto('/app/chat/settings')
  // The first answer is cut off (too long): it is asked once more.
  gemini.cutNextSetup()
  await page.getByRole('button', { name: 'Write it from my website' }).click()
  await expect(page.getByLabel('Main instructions')).toHaveValue(/Bloom & Co\./)
  await expect(page.getByLabel('Red-flag topics')).toHaveValue('refund\ncomplaint')
  await page.getByLabel('Name', { exact: true }).fill('Bloom helper')
  await page.getByLabel('Your data endpoint').fill(`http://127.0.0.1:${COMPANY_PORT}/loudpilot`)
  await page.getByRole('button', { name: 'order status' }).click()
  // The test request is signed like the real ones.
  await page.getByRole('button', { name: 'Send a test request' }).click()
  await page.getByLabel('order_number').fill('A-1001')
  await page.getByLabel('email_or_phone').fill('nino@example.com')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Shipped' })).toBeVisible()
  await page.getByLabel('Show the chat on my website').check()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()

  await visitor.reload()
  await visitor.getByRole('button', { name: 'Open chat' }).click()
  await say('Do you deliver?')
  await expect(chat()).toContainText('We deliver across Tbilisi within 2 hours.')
  expect(sql(`select count(*) from "CreditEntry" where "workspaceId"='${ws}' and action='chatConversation'`)).toBe('1')

  calls.length = 0
  await say('Where is my order A-1001? nino@example.com')
  await expect(chat()).toContainText('Shipped')
  expect(calls).toHaveLength(1)
  expect(calls[0]).toMatchObject({ valid: true, body: { action: 'order_status', params: { order_number: 'A-1001', email_or_phone: 'nino@example.com' }, customer: null } })

  await say('I want a refund for the roses')
  await expect(chat()).toContainText('A teammate will join this chat.')
  const conv = sql(`select id from "ChatConversation" where "workspaceId"='${ws}' order by "createdAt" desc limit 1`)
  expect(sql(`select status || ' ' || "handoffReason" from "ChatConversation" where id='${conv}'`)).toBe('HUMAN Red flag: refund')
  // One charge per conversation.
  expect(sql(`select count(*) from "CreditEntry" where "workspaceId"='${ws}' and action='chatConversation'`)).toBe('1')

  await page.goto(`/app/chat?c=${conv}`)
  await expect(page.getByRole('log', { name: 'Messages' })).toContainText('I want a refund for the roses')
  await expect(page.getByText('Handed over: Red flag: refund')).toBeVisible()
  await page.getByLabel('Your answer').fill('Hi Nino, Ana from Bloom here — of course, we will refund it.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(chat()).toContainText('Ana from Bloom here', { timeout: 20_000 })
})

test('signed-in customers: account lookups only with a valid identity hash', async () => {
  await page.goto('/app/chat/settings')
  await page.getByRole('button', { name: 'my orders' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()

  const fresh = async (identity: Record<string, string>) => {
    await visitor.evaluate((k) => localStorage.removeItem(`lp_chat_${k}`), key)
    await visitor.reload()
    await visitor.evaluate((id) => (window as unknown as { loudpilot: (...a: unknown[]) => void }).loudpilot('identify', id), identity)
    await visitor.getByRole('button', { name: 'Open chat' }).click()
  }

  // A forged hash: the account lookup is not even offered.
  calls.length = 0
  await fresh({ user_id: 'u-99', user_hash: 'f'.repeat(64) })
  await say('Show my orders')
  await expect(chat()).toContainText('We deliver across Tbilisi')
  expect(calls).toHaveLength(0)

  await fresh({ user_id: 'u-42', user_hash: hmac(secret, 'u-42') })
  await say('Show my orders')
  await expect(chat()).toContainText('A-2002')
  expect(calls[0]).toMatchObject({ valid: true, body: { action: 'my_orders', customer: { id: 'u-42', verified: true } } })
})

test('the demo shop shows the chat before it is switched on, as a test', async () => {
  sql(`update "ChatBot" set enabled=false where "workspaceId"='${ws}'`)
  await page.goto('/demo-shop')
  await page.getByRole('button', { name: 'Add to cart' }).first().click()
  await page.getByRole('button', { name: /Pay 120 GEL/ }).click()
  await expect.poll(() => sql(`select count(*) from "TagEvent" e join "Site" s on s.id=e."siteId" where s."workspaceId"='${ws}' and test and name='Purchase'`)).toBe('1')
  await page.getByRole('button', { name: 'Open chat' }).click()
  await page.getByRole('dialog', { name: 'Bloom helper' }).getByRole('textbox').fill('Hello')
  await page.getByRole('dialog', { name: 'Bloom helper' }).getByRole('textbox').press('Enter')
  await expect(page.getByRole('dialog', { name: 'Bloom helper' })).toContainText('We deliver across Tbilisi')
  expect(sql(`select test from "ChatConversation" where "workspaceId"='${ws}' order by "createdAt" desc limit 1`)).toBe('t')
  // The owner's test chats are free.
  expect(sql(`select "chargedAt" is null from "ChatConversation" where "workspaceId"='${ws}' order by "createdAt" desc limit 1`)).toBe('t')
  // The public site does not get the chat while it is off.
  const cfg = await (await page.request.get(`/api/tag/config?s=${key}`)).json()
  expect(cfg.chat).toBeNull()
})

test('the owner preview works only on Loudpilot itself', async () => {
  // The chat is still off (previous test): only the demo shop's preview gets it.
  await page.goto('/demo-shop')
  const preview = (await page.locator('script[data-preview]').getAttribute('data-preview'))!
  const send = (origin: string, n: number) =>
    page.request.post('/api/chat/send', {
      headers: { 'content-type': 'text/plain', origin },
      data: JSON.stringify({ s: key, v: `preview-${Date.now()}-${n}`, preview, text: 'Hello' }),
    })
  expect((await send(`http://127.0.0.1:${SITE_PORT}`, 1)).status()).toBe(404)
  expect((await send('http://localhost:3100', 2)).status()).toBe(200)
})

test('the edge: security headers, the widget still loads cross-site, big bodies are refused', async () => {
  const home = await page.request.get('/')
  expect(home.headers()['x-frame-options']).toBe('DENY')
  expect(home.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(home.headers()['x-content-type-options']).toBe('nosniff')
  expect(home.headers()['strict-transport-security']).toContain('max-age=31536000')
  expect(home.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(home.headers()['x-powered-by']).toBeUndefined()
  // Monrem's return page opens in our own payment frame.
  expect((await page.request.get('/pay/done')).headers()['x-frame-options']).toBe('SAMEORIGIN')

  for (const script of ['/t.js', '/w.js']) {
    const r = await page.request.get(script)
    expect(r.status()).toBe(200)
    expect(r.headers()['access-control-allow-origin']).toBe('*')
    expect(r.headers()['content-type']).toContain('javascript')
  }
  const pre = await page.request.fetch('/api/chat/send', { method: 'OPTIONS', headers: { origin: `http://127.0.0.1:${SITE_PORT}` } })
  expect(pre.status()).toBe(204)
  expect(pre.headers()['access-control-allow-origin']).toBe('*')

  const big = 'x'.repeat(100_000)
  for (const path of ['/api/tag/collect', '/api/chat/send', '/api/chat/poll', '/api/client-errors']) {
    const r = await page.request.post(path, { headers: { 'content-type': 'text/plain' }, data: JSON.stringify({ s: key, pad: big }) })
    expect(r.status(), path).toBe(413)
  }
  // An over-long user id is refused, not stored cut short.
  const long = await page.request.post('/api/tag/v1/events', {
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    data: { site: key, events: [{ name: 'Lead', user_id: 'u'.repeat(500) }] },
  })
  expect(long.status()).toBe(400)
})
