import { expect, test, type Page } from '@playwright/test'
import { createHash, randomBytes } from 'node:crypto'
import { latestMail, linkFrom, newAccount, sql } from './helpers'

// MCP server: JSON-RPC over HTTP with personal tokens and OAuth (dynamic
// registration, PKCE, consent, refresh), tools acting in one workspace.

test.describe.configure({ mode: 'serial' })

const BASE = 'http://localhost:3100'
let page: Page
let email = ''
let ws = ''
let token = ''

async function rpc(method: string, params: object = {}, bearer = token, id: number | null = 1) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', ...(id !== null ? { id } : {}), method, params }),
  })
  return { status: res.status, headers: res.headers, body: res.status === 202 ? null : await res.json() }
}
const call = async (name: string, args: object = {}, bearer = token) => (await rpc('tools/call', { name, arguments: args }, bearer)).body.result

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  ;({ email } = await newAccount(page, 'mcp', 'Arca Development'))
  ws = sql(`select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}'`)
})
test.afterAll(async () => page.close())

test('without a token: 401 pointing to the sign-in metadata', async () => {
  const r = await rpc('initialize', {}, '')
  expect(r.status).toBe(401)
  expect(r.headers.get('www-authenticate')).toContain('resource_metadata="http://localhost:3100/.well-known/oauth-protected-resource"')
  const meta = await (await fetch(`${BASE}/.well-known/oauth-protected-resource/api/mcp`)).json()
  expect(meta).toMatchObject({ resource: `${BASE}/api/mcp`, authorization_servers: [BASE] })
  const as = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json()
  expect(as).toMatchObject({ code_challenge_methods_supported: ['S256'], registration_endpoint: `${BASE}/oauth/register` })
})

test('personal token: create, shown once', async () => {
  await page.goto('/app/mcp')
  await page.getByLabel('Token name').fill('Claude Code laptop')
  await page.getByRole('button', { name: 'Create token' }).click()
  token = (await page.getByTestId('new-token').textContent())!.trim()
  expect(token).toMatch(/^khma_pat_/)
  expect(sql(`select count(*) from "AccessToken" where "tokenHash"='${createHash('sha256').update(token).digest('hex')}' and kind='PERSONAL'`)).toBe('1')
  await page.reload()
  await expect(page.getByTestId('new-token')).toHaveCount(0)
  await expect(page.getByText('Claude Code laptop')).toBeVisible()
})

test('protocol: initialize, notifications, ping, tools/list', async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
  expect(init.status).toBe(200)
  expect(init.body.result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'khma' }, capabilities: { tools: {} } })
  expect(init.body.result.instructions).toContain('Arca Development')
  expect((await rpc('notifications/initialized', {}, token, null)).status).toBe(202)
  expect((await rpc('ping')).body.result).toEqual({})
  const list = (await rpc('tools/list')).body.result.tools as { name: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean } }[]
  expect(list.map((t) => t.name)).toEqual(expect.arrayContaining(['get_overview', 'get_dossier', 'get_analytics', 'create_post', 'write_post_with_ai', 'publish_post', 'create_goal', 'get_weekly_review', 'create_plan', 'apply_plan']))
  for (const t of list) expect(t.inputSchema.type).toBe('object')
  expect(list.find((t) => t.name === 'get_overview')!.annotations.readOnlyHint).toBe(true)
  expect((await rpc('resources/list')).body.error.code).toBe(-32601)
})

test('tools act in the token’s workspace', async () => {
  const overview = await call('get_overview')
  expect(overview.structuredContent).toMatchObject({ workspace: 'Arca Development', you: { role: 'owner' }, credits: 50 })

  const created = await call('create_post', { content: 'Hello from Claude', hashtags: ['arca'], channels: ['INSTAGRAM'], scheduledAt: '2026-11-02T19:00:00+04:00' })
  expect(created.isError).toBeFalsy()
  expect(created.structuredContent.post).toMatchObject({ status: 'draft', channels: ['INSTAGRAM'] })
  expect(sql(`select status from "Post" where content='Hello from Claude' and "workspaceId"='${ws}'`)).toBe('DRAFT')

  // Scheduling needs a connected account.
  const sched = await call('create_post', { content: 'x', scheduledAt: '2099-01-01T10:00:00Z', schedule: true })
  expect(sched.isError).toBe(true)
  expect(sched.content[0].text).toContain('No connected')

  const posts = await call('list_posts', { status: 'draft' })
  expect(posts.structuredContent.posts.map((p: { content: string }) => p.content)).toContain('Hello from Claude')

  const badGoal = await call('create_goal', { scope: 'posts', metric: 'cost_per_result', target: 5 })
  expect(badGoal.isError).toBe(true)
  const goal = await call('create_goal', { scope: 'posts', network: 'instagram', metric: 'avg_reach', target: 1000 })
  expect(goal.structuredContent.goal).toMatchObject({ metric: 'avg_reach', target: 1000, status: 'no_data' })

  const badArgs = await call('get_analytics', { days: 12 })
  expect(badArgs.isError).toBe(true)
  expect(badArgs.content[0].text).toContain('Invalid arguments')
  expect((await rpc('tools/call', { name: 'nope', arguments: {} })).body.error.code).toBe(-32602)
  expect((await call('get_weekly_review')).structuredContent.review).toBeNull()
})

test('usage is counted on the AI assistants page', async () => {
  await page.goto('/app/mcp?range=1h')
  expect(Number(await page.getByTestId('mcp-total').textContent().then((t) => t!.trim().split(/\s/)[0]))).toBeGreaterThanOrEqual(8)
  await expect(page.getByText('create_post', { exact: false }).first()).toBeVisible()
})

test('OAuth: register, sign in, consent, PKCE, refresh, revoke', async ({ browser }) => {
  const redirect = `${BASE}/oauth-test-callback`
  const reg = await fetch(`${BASE}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [redirect] }) })
  expect(reg.status).toBe(201)
  const { client_id } = await reg.json()
  expect((await fetch(`${BASE}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['javascript:alert(1)'] }) })).status).toBe(400)

  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const authorize = `${BASE}/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'khma' })}`

  // A fresh browser: log in by magic link, land back on the consent page.
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(authorize)
  await expect(p).toHaveURL(/\/login/)
  const used = linkFrom((await latestMail(email, 'sign-in link')).Text, '/auth/magic?token=')
  // One sign-in email per minute per address: age the sign-up one.
  sql(`update "MagicLink" set "createdAt" = "createdAt" - interval '5 minutes' where email='${email}'`)
  await p.getByPlaceholder('name@company.com').fill(email)
  await p.getByRole('button', { name: 'Send magic link' }).click()
  // Wait for the new email, not the one used to sign up.
  let link = used
  await expect.poll(async () => (link = linkFrom((await latestMail(email, 'sign-in link')).Text, '/auth/magic?token=')), { timeout: 20_000 }).not.toBe(used)
  await p.goto(link)
  await p.getByRole('button', { name: 'Continue' }).click()
  await p.waitForURL(/\/oauth\/consent/)
  await expect(p.getByRole('heading', { name: /Claude wants to work in Khma/ })).toBeVisible()
  await p.getByRole('button', { name: 'Allow' }).click()
  await p.waitForURL((u) => u.pathname === '/oauth-test-callback')
  const back = new URL(p.url())
  expect(back.searchParams.get('state')).toBe('xyz')
  const code = back.searchParams.get('code')!

  const token = async (form: Record<string, string>) => fetch(`${BASE}/oauth/token`, { method: 'POST', body: new URLSearchParams(form) })
  expect((await token({ grant_type: 'authorization_code', code, client_id, redirect_uri: redirect, code_verifier: 'x'.repeat(50) })).status).toBe(400)
  const ok = await token({ grant_type: 'authorization_code', code, client_id, redirect_uri: redirect, code_verifier: verifier })
  expect(ok.status).toBe(200)
  const t1 = await ok.json()
  expect(t1).toMatchObject({ token_type: 'Bearer', scope: 'khma' })
  expect((await token({ grant_type: 'authorization_code', code, client_id, redirect_uri: redirect, code_verifier: verifier })).status).toBe(400)

  expect((await call('get_overview', {}, t1.access_token)).structuredContent.workspace).toBe('Arca Development')

  // Refresh rotates: the old pair stops working.
  const t2 = await (await token({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id })).json()
  expect(t2.access_token).toBeTruthy()
  expect((await rpc('ping', {}, t1.access_token)).status).toBe(401)
  expect((await token({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id })).status).toBe(400)
  expect((await rpc('ping', {}, t2.access_token)).status).toBe(200)

  // Shown under connected apps; revoking cuts it off.
  await page.goto('/app/mcp')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Revoke Claude', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Revoke Claude', exact: true })).toHaveCount(0)
  expect((await rpc('ping', {}, t2.access_token)).status).toBe(401)

  // Deny sends the app an error.
  await p.goto(authorize)
  await p.waitForURL(/\/oauth\/consent/)
  await p.getByRole('button', { name: 'Deny' }).click()
  await p.waitForURL((u) => u.pathname === '/oauth-test-callback')
  expect(new URL(p.url()).searchParams.get('error')).toBe('access_denied')
  await ctx.close()
})

test('a revoked personal token stops working', async () => {
  await page.goto('/app/mcp')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Revoke Claude Code laptop' }).click()
  await expect(page.getByRole('button', { name: 'Revoke Claude Code laptop' })).toHaveCount(0)
  expect((await rpc('ping')).status).toBe(401)
})
