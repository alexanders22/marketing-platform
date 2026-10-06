import 'server-only'
import type { Prisma, SocialAccount } from '@prisma/client'
import { decrypt, encrypt } from './crypto'
import { appUrl } from './mail'
import { ACTIVE_WORKSPACE } from './pause'
import { prisma } from './prisma'

// Google Analytics 4: the customer signs in with Google (read-only access),
// picks a property, and Loudpilot reads daily visits, users and key events
// (sign-ups, leads, purchases) with their channels. The same OAuth client as
// "Continue with Google"; the base URLs can point at a fake in tests.

export const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
export const GA_STATE_COOKIE = 'khma_ga_state'
const AUTH_URL = process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token'
const ADMIN_URL = process.env.GA_ADMIN_URL || 'https://analyticsadmin.googleapis.com/v1beta'
const DATA_URL = process.env.GA_DATA_URL || 'https://analyticsdata.googleapis.com/v1beta'

// Its own client if set (tests use a fake one), else the sign-in client.
const clientId = () => process.env.GA_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ''
const clientSecret = () => process.env.GA_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || ''
export const gaEnabled = () => Boolean(clientId() && clientSecret())
export const gaRedirectUri = () => `${appUrl()}/auth/google-analytics/callback`

export class GaError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message)
  }
}

// Search Console signs in through the same client and callback.
export const SC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

export function gaAuthUrl(state: string, scope = GA_SCOPE) {
  const url = new URL(AUTH_URL)
  url.search = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: gaRedirectUri(),
    response_type: 'code',
    scope,
    state,
    // A refresh token, every time (Google only sends it on consent).
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  }).toString()
  return url.toString()
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope?: string }

async function token(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...body }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string }
  if (!res.ok || !data.access_token) throw new GaError(data.error_description || data.error || `Google token error ${res.status}`, res.status)
  return data
}

export async function exchangeGaCode(code: string, scope = GA_SCOPE) {
  const t = await token({ code, redirect_uri: gaRedirectUri(), grant_type: 'authorization_code' })
  if (!t.refresh_token) throw new GaError('Google did not grant offline access')
  const scopes = (t.scope ?? '').split(' ').filter(Boolean)
  if (!scopes.includes(scope)) throw new GaError(scope === GA_SCOPE ? 'Analytics access was not granted' : 'Search Console access was not granted')
  return { access: t.access_token, refresh: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000), scopes }
}

// A valid access token for the account, refreshed (and stored) when needed.
export async function gaAccessToken(a: Pick<SocialAccount, 'id' | 'accessTokenEnc' | 'refreshTokenEnc' | 'expiresAt'>) {
  if (a.accessTokenEnc && a.expiresAt && a.expiresAt.getTime() > Date.now() + 60_000) return decrypt(a.accessTokenEnc)
  if (!a.refreshTokenEnc) throw new GaError('Reconnect Google Analytics', 401)
  const t = await token({ refresh_token: decrypt(a.refreshTokenEnc), grant_type: 'refresh_token' })
  const expiresAt = new Date(Date.now() + t.expires_in * 1000)
  await prisma.socialAccount.update({ where: { id: a.id }, data: { accessTokenEnc: encrypt(t.access_token), expiresAt } })
  return t.access_token
}

export async function call<T>(url: string, accessToken: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } }
  if (!res.ok) throw new GaError(data.error?.message || `Google Analytics error ${res.status}`, res.status)
  return data
}

export type GaProperty = { id: string; name: string; account: string }

// Every GA4 property the person can read, with its account name.
export async function listProperties(accessToken: string): Promise<GaProperty[]> {
  const out: GaProperty[] = []
  let pageToken = ''
  for (let i = 0; i < 10; i++) {
    const data = await call<{
      accountSummaries?: { displayName?: string; propertySummaries?: { property: string; displayName?: string }[] }[]
      nextPageToken?: string
    }>(`${ADMIN_URL}/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, accessToken)
    for (const acc of data.accountSummaries ?? []) {
      for (const p of acc.propertySummaries ?? []) out.push({ id: p.property, name: p.displayName || p.property, account: acc.displayName || '' })
    }
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return out
}

type Report = { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] }

const ymd = (gaDate: string) => `${gaDate.slice(0, 4)}-${gaDate.slice(4, 6)}-${gaDate.slice(6, 8)}`
const num = (v: string | undefined) => (v ? Number(v) || 0 : 0)

// Reads the last `days` days into WebsiteDay rows: totals, sessions and key
// events per channel, and key events by name.
export async function syncWebsite(accountId: string, days?: number) {
  const a = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } })
  if (a.network !== 'GOOGLE_ANALYTICS' || a.externalId.startsWith('pending:')) return 0
  const span = days ?? (a.syncedAt ? 4 : 365)
  const dateRanges = [{ startDate: `${span - 1}daysAgo`, endDate: 'today' }]
  const report = (body: object) => call<Report>(`${DATA_URL}/${a.externalId}:runReport`, access, { dateRanges, limit: 10000, ...body })

  let access: string
  try {
    access = await gaAccessToken(a)
    const [totals, channels, events, campaigns] = await Promise.all([
      report({
        dimensions: [{ name: 'date' }],
        metrics: ['sessions', 'totalUsers', 'newUsers', 'engagedSessions', 'keyEvents', 'totalRevenue'].map((name) => ({ name })),
      }),
      report({ dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }, { name: 'keyEvents' }] }),
      report({
        dimensions: [{ name: 'date' }, { name: 'eventName' }],
        metrics: [{ name: 'keyEvents' }],
        metricFilter: { filter: { fieldName: 'keyEvents', numericFilter: { operation: 'GREATER_THAN', value: { doubleValue: 0 } } } },
      }),
      // Per utm_campaign: Loudpilot tags post links with the campaign's name.
      report({
        dimensions: [{ name: 'date' }, { name: 'sessionCampaignName' }],
        metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
        dimensionFilter: { notExpression: { filter: { fieldName: 'sessionCampaignName', inListFilter: { values: ['(not set)', '(direct)', '(organic)', '(referral)'] } } } },
      }),
    ])

    const byDay = new Map<
      string,
      { channels: { channel: string; sessions: number; keyEvents: number }[]; events: Record<string, number>; campaigns: { campaign: string; sessions: number; keyEvents: number }[] }
    >()
    const day = (d: string) => byDay.get(d) ?? (byDay.set(d, { channels: [], events: {}, campaigns: [] }), byDay.get(d)!)
    for (const r of channels.rows ?? []) {
      day(ymd(r.dimensionValues[0].value)).channels.push({ channel: r.dimensionValues[1].value, sessions: num(r.metricValues[0].value), keyEvents: num(r.metricValues[1].value) })
    }
    for (const r of events.rows ?? []) day(ymd(r.dimensionValues[0].value)).events[r.dimensionValues[1].value] = num(r.metricValues[0].value)
    for (const r of campaigns.rows ?? []) {
      day(ymd(r.dimensionValues[0].value)).campaigns.push({ campaign: r.dimensionValues[1].value, sessions: num(r.metricValues[0].value), keyEvents: num(r.metricValues[1].value) })
    }

    let n = 0
    for (const r of totals.rows ?? []) {
      const date = ymd(r.dimensionValues[0].value)
      const [sessions, users, newUsers, engaged, keyEvents, revenue] = r.metricValues.map((m) => num(m.value))
      const extra = byDay.get(date)
      const data = {
        sessions: Math.round(sessions),
        users: Math.round(users),
        newUsers: Math.round(newUsers),
        engaged: Math.round(engaged),
        keyEvents,
        revenue,
        channels: (extra?.channels ?? []).sort((x, y) => y.sessions - x.sessions) as unknown as Prisma.InputJsonValue,
        events: (extra?.events ?? {}) as Prisma.InputJsonValue,
        campaigns: (extra?.campaigns ?? []) as unknown as Prisma.InputJsonValue,
      }
      await prisma.websiteDay.upsert({
        where: { accountId_date: { accountId: a.id, date } },
        create: { workspaceId: a.workspaceId, accountId: a.id, date, ...data },
        update: data,
      })
      n++
    }
    await prisma.socialAccount.update({ where: { id: a.id }, data: { syncedAt: new Date(), lastError: null, status: 'ACTIVE' } })
    return n
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const lost = e instanceof GaError && (e.status === 401 || e.status === 403 || /invalid_grant|Reconnect/.test(message))
    await prisma.socialAccount.update({
      where: { id: a.id },
      data: { lastError: message.slice(0, 300), syncedAt: new Date(), ...(lost ? { status: 'EXPIRED' as const } : {}) },
    })
    throw e
  }
}

// Every few hours from the ticker: today's numbers settle over the day.
export async function syncWebsitesDue(limit = 10) {
  const due = await prisma.socialAccount.findMany({
    where: {
      network: 'GOOGLE_ANALYTICS',
      status: 'ACTIVE',
      NOT: { externalId: { startsWith: 'pending:' } },
      workspace: ACTIVE_WORKSPACE,
      OR: [{ syncedAt: null }, { syncedAt: { lt: new Date(Date.now() - 3 * 60 * 60_000) } }],
    },
    orderBy: { syncedAt: { sort: 'asc', nulls: 'first' } },
    take: limit,
    select: { id: true },
  })
  let n = 0
  for (const d of due) n += await syncWebsite(d.id).catch((e) => (console.error('GA sync failed', d.id, e instanceof Error ? e.message : e), 0))
  return n
}
