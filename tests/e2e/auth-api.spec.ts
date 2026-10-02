import { expect, test, type APIRequestContext } from '@playwright/test'
import { execSync } from 'node:child_process'
import { sql } from './helpers'

// QA: partner API /api/v1/* — key auth, workspace upsert, signup, credits,
// SINGLE-mode limit, partner-to-partner isolation.

const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`

function createPartner(slug: string, name: string, mode: 'SINGLE' | 'MULTI') {
  const out = execSync(`npx tsx scripts/create-partner.ts ${slug} "${name}" ${mode}`, { encoding: 'utf8' })
  const key = out.match(/khma_[A-Za-z0-9_-]+/)?.[0]
  if (!key) throw new Error(`no key in output: ${out}`)
  return key
}

let P1: string, P2: string, PS: string
const auth = (key: string) => ({ authorization: `Bearer ${key}` })

const upsert = (r: APIRequestContext, key: string, data: unknown) => r.post('/api/v1/workspaces', { headers: auth(key), data })

test.describe.serial('partner API', () => {
  test.beforeAll(() => {
    P1 = createPartner(`qa-auth-partner-${run}`, 'QA Partner', 'MULTI')
    P2 = createPartner(`qa-auth-partner2-${run}`, 'QA Partner 2', 'MULTI')
    PS = createPartner(`qa-auth-single-${run}`, 'QA Single', 'SINGLE')
  })

  test('auth errors', async ({ request }) => {
    const cases: [Record<string, string>, number, string][] = [
      [{}, 401, 'unauthorized'],
      [{ authorization: 'Bearer ' }, 401, 'unauthorized'],
      [{ authorization: 'Bearer khma_wrong' }, 401, 'unauthorized'],
      [{ authorization: `Basic ${P1}` }, 401, 'unauthorized'],
      [{ authorization: P1 }, 401, 'unauthorized'],
    ]
    for (const [headers, status, code] of cases) {
      for (const path of ['/api/v1/ping', '/api/v1/workspaces', '/api/v1/workspaces/x', '/api/v1/workspaces/x/credits']) {
        const res = await request.get(path, { headers })
        expect(res.status(), `${path} ${JSON.stringify(headers)}`).toBe(status)
        expect((await res.json()).error.code).toBe(code)
      }
    }
    const ping = await request.get('/api/v1/ping', { headers: auth(P1) })
    expect(ping.status()).toBe(200)
    expect(await ping.json()).toEqual({ partner: { name: 'QA Partner', slug: `qa-auth-partner-${run}`, mode: 'MULTI' } })
    await expect.poll(() => sql(`select count(*) from "ApiKey" k join "Partner" p on p.id=k."partnerId" where p.slug='qa-auth-partner-${run}' and k."lastUsedAt" is not null`)).toBe('1')
  })

  test('revoked key and suspended partner are refused', async ({ request }) => {
    const key = createPartner(`qa-auth-revoke-${run}`, 'QA Revoke', 'MULTI')
    expect((await request.get('/api/v1/ping', { headers: auth(key) })).status()).toBe(200)
    sql(`update "Partner" set status='SUSPENDED' where slug='qa-auth-revoke-${run}'`)
    const s = await request.get('/api/v1/ping', { headers: auth(key) })
    expect(s.status()).toBe(403)
    expect((await s.json()).error.code).toBe('partner_suspended')
    sql(`update "Partner" set status='ACTIVE' where slug='qa-auth-revoke-${run}'`)
    sql(`update "ApiKey" set "revokedAt"=now() where "partnerId"=(select id from "Partner" where slug='qa-auth-revoke-${run}')`)
    expect((await request.get('/api/v1/ping', { headers: auth(key) })).status()).toBe(401)
  })

  test('workspace upsert is idempotent and validated', async ({ request }) => {
    let res = await upsert(request, P1, { externalId: 'co-1', name: 'Company One', locale: 'en' })
    expect(res.status()).toBe(200)
    expect((await res.json()).workspace).toMatchObject({ externalId: 'co-1', name: 'Company One', locale: 'en', registered: false, account: null })
    res = await upsert(request, P1, { externalId: 'co-1', name: 'Company One Renamed' })
    expect((await res.json()).workspace).toMatchObject({ name: 'Company One Renamed', locale: 'en' })
    expect(sql(`select count(*) from "Workspace" w join "Partner" p on p.id=w."partnerId" where p.slug='qa-auth-partner-${run}'`)).toBe('1')
    // Internal ids are not exposed.
    expect(JSON.stringify(await res.json())).not.toMatch(/"id"|partnerId|accountId/)

    for (const bad of [{}, { externalId: '', name: 'x' }, { externalId: 'x'.repeat(192), name: 'x' }, { externalId: 'x', name: '' }, { externalId: 'x', name: 'x', locale: 'e' }, []]) {
      const r = await upsert(request, P1, bad)
      expect(r.status(), JSON.stringify(bad)).toBe(400)
      expect((await r.json()).error.code).toBe('invalid_request')
    }
    const nj = await request.post('/api/v1/workspaces', { headers: { ...auth(P1), 'content-type': 'application/json' }, data: Buffer.from('{not json') })
    expect(nj.status()).toBe(400)
    expect((await nj.json()).error.code).toBe('invalid_json')
  })

  test('signup + credits', async ({ request }) => {
    await upsert(request, P1, { externalId: 'co-2', name: 'Company Two' })
    let r = await request.get('/api/v1/workspaces/co-2/credits', { headers: auth(P1) })
    expect(r.status()).toBe(409)
    expect((await r.json()).error.code).toBe('not_registered')

    const body = { name: 'Company Two LLC', email: 'Owner@QA-Auth.test', country: 'ge', currency: 'usd', acceptTerms: true }
    r = await request.post('/api/v1/workspaces/co-2/signup', { headers: auth(P1), data: { ...body, acceptTerms: false } })
    expect(r.status()).toBe(400)
    r = await request.post('/api/v1/workspaces/co-2/signup', { headers: auth(P1), data: { ...body, email: 'nope' } })
    expect(r.status()).toBe(400)
    r = await request.post('/api/v1/workspaces/nope/signup', { headers: auth(P1), data: body })
    expect(r.status()).toBe(404)

    r = await request.post('/api/v1/workspaces/co-2/signup', { headers: auth(P1), data: body })
    expect(r.status()).toBe(201)
    expect((await r.json()).workspace).toMatchObject({
      registered: true,
      account: { name: 'Company Two LLC', email: 'owner@qa-auth.test', currency: 'USD', creditBalance: 0 },
    })
    expect(sql(`select a.country||'|'||(a."partnerId"=p.id)::text||'|'||(a."termsAcceptedAt" is not null)::text from "Account" a join "Workspace" w on w."accountId"=a.id join "Partner" p on p.id=w."partnerId" where p.slug='qa-auth-partner-${run}' and w."externalId"='co-2'`)).toBe('GE|true|true')

    r = await request.post('/api/v1/workspaces/co-2/signup', { headers: auth(P1), data: body })
    expect(r.status()).toBe(409)
    expect((await r.json()).error.code).toBe('already_registered')

    r = await request.get('/api/v1/workspaces/co-2/credits', { headers: auth(P1) })
    expect(r.status()).toBe(200)
    expect(await r.json()).toEqual({ balance: 0, currency: 'USD', entries: [] })

    r = await request.get('/api/v1/workspaces/co-2', { headers: auth(P1) })
    expect((await r.json()).workspace.registered).toBe(true)
  })

  test('concurrent signups for one workspace create exactly one account', async ({ request }) => {
    await upsert(request, P1, { externalId: 'co-race', name: 'Race' })
    const body = { name: 'Race LLC', email: `race-${run}@qa-auth.test`, acceptTerms: true }
    const res = await Promise.all(Array.from({ length: 6 }, () => request.post('/api/v1/workspaces/co-race/signup', { headers: auth(P1), data: body })))
    const codes = res.map((r) => r.status()).sort()
    expect(codes.filter((c) => c === 201)).toHaveLength(1)
    expect(codes.filter((c) => c !== 201 && c !== 409)).toEqual([])
    expect(sql(`select count(*) from "Account" where email='race-${run}@qa-auth.test'`)).toBe('1')
  })

  test("a partner can't read or change another partner's workspaces", async ({ request }) => {
    // P1 owns co-1 and co-2; P2 uses the same externalId for its own profile.
    for (const path of ['/api/v1/workspaces/co-2', '/api/v1/workspaces/co-2/credits']) {
      const r = await request.get(path, { headers: auth(P2) })
      expect(r.status(), path).toBe(404)
      expect((await r.json()).error.code).toBe('workspace_not_found')
    }
    const s = await request.post('/api/v1/workspaces/co-1/signup', { headers: auth(P2), data: { name: 'x', email: 'x@qa-auth.test', acceptTerms: true } })
    expect(s.status()).toBe(404)

    const own = await upsert(request, P2, { externalId: 'co-2', name: 'P2 own co-2' })
    expect((await own.json()).workspace).toMatchObject({ name: 'P2 own co-2', registered: false })
    expect(sql(`select w.name from "Workspace" w join "Partner" p on p.id=w."partnerId" where p.slug='qa-auth-partner-${run}' and w."externalId"='co-2'`)).toBe('Company Two')

    const list2 = (await (await request.get('/api/v1/workspaces', { headers: auth(P2) })).json()).workspaces
    expect(list2.map((w: { name: string }) => w.name)).toEqual(['P2 own co-2'])
    const list1 = (await (await request.get('/api/v1/workspaces', { headers: auth(P1) })).json()).workspaces
    expect(list1.map((w: { externalId: string }) => w.externalId).sort()).toEqual(['co-1', 'co-2', 'co-race'])
    // Path tricks.
    for (const path of ['/api/v1/workspaces/co-2%2F..%2Fco-1', '/api/v1/workspaces/%2e%2e', '/api/v1/workspaces/co%2D2']) {
      const r = await request.get(path, { headers: auth(P2) })
      if (r.status() === 200) expect((await r.json()).workspace.name).toBe('P2 own co-2')
    }
  })

  test('SINGLE partner may only have one workspace', async ({ request }) => {
    expect((await upsert(request, PS, { externalId: 'me', name: 'Me' })).status()).toBe(200)
    expect((await upsert(request, PS, { externalId: 'me', name: 'Me again' })).status()).toBe(200)
    const r = await upsert(request, PS, { externalId: 'other', name: 'Other' })
    expect(r.status()).toBe(409)
    expect((await r.json()).error.code).toBe('single_workspace')
  })

  test('SINGLE limit holds under concurrent creates', async ({ request }) => {
    const key = createPartner(`qa-auth-single-race-${run}`, 'QA Single Race', 'SINGLE')
    await Promise.all(Array.from({ length: 8 }, (_, i) => upsert(request, key, { externalId: `w${i}`, name: `W${i}` })))
    expect(sql(`select count(*) from "Workspace" w join "Partner" p on p.id=w."partnerId" where p.slug='qa-auth-single-race-${run}'`)).toBe('1')
  })
})
