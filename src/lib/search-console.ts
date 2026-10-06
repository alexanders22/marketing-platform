import 'server-only'
import type { SocialAccount } from '@prisma/client'
import { call, gaAccessToken } from './ga'

// Google Search Console: which searches show the website, how often people
// click, and at which position. Same Google sign-in as Analytics
// (webmasters.readonly); SC_URL can point at a fake in tests.

const SC_URL = (process.env.SC_URL || 'https://www.googleapis.com/webmasters/v3').replace(/\/$/, '')

export type ScSite = { url: string; permission: string }

// Sites the person may read (unverified ones return no data).
export async function listSites(accessToken: string): Promise<ScSite[]> {
  const r = await call<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(`${SC_URL}/sites`, accessToken)
  return (r.siteEntry ?? []).filter((s) => s.permissionLevel !== 'siteUnverifiedUser').map((s) => ({ url: s.siteUrl, permission: s.permissionLevel }))
}

const host = (u: string) => {
  try {
    return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '')
  } catch {
    return u.replace(/^sc-domain:/, '').replace(/^www\./, '')
  }
}

// The site for the brand's website: a domain property first, then a URL prefix.
export function bestSite(sites: ScSite[], website: string | null | undefined) {
  if (!website) return sites[0] ?? null
  const h = host(website)
  return sites.find((s) => s.url === `sc-domain:${h}`) ?? sites.find((s) => !s.url.startsWith('sc-domain:') && host(s.url) === h) ?? sites[0] ?? null
}

export type ScRow = { key: string; clicks: number; impressions: number; ctr: number; position: number }
export type ScTotals = { clicks: number; impressions: number; ctr: number; position: number }

const day = (d: Date) => d.toISOString().slice(0, 10)

async function query(site: string, token: string, body: Record<string, unknown>) {
  const r = await call<{ rows?: { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }[] }>(
    `${SC_URL}/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    token,
    body,
  )
  return (r.rows ?? []).map((x) => ({ key: x.keys?.[0] ?? '', clicks: x.clicks, impressions: x.impressions, ctr: x.ctr, position: x.position }))
}

const totals = (rows: ScRow[]): ScTotals => {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0)
  const impressions = rows.reduce((s, r) => s + r.impressions, 0)
  const position = impressions ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions : 0
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position }
}

// The last 28 days (Search Console lags ~2 days) and the 28 before.
export async function searchData(a: Pick<SocialAccount, 'id' | 'externalId' | 'accessTokenEnc' | 'refreshTokenEnc' | 'expiresAt'>, now = new Date()) {
  const token = await gaAccessToken(a)
  const end = new Date(now.getTime() - 2 * 86_400_000)
  const start = new Date(end.getTime() - 27 * 86_400_000)
  const prevEnd = new Date(start.getTime() - 86_400_000)
  const prevStart = new Date(prevEnd.getTime() - 27 * 86_400_000)
  const range = { startDate: day(start), endDate: day(end) }
  const [queries, pages, daily, prevDaily] = await Promise.all([
    query(a.externalId, token, { ...range, dimensions: ['query'], rowLimit: 250 }),
    query(a.externalId, token, { ...range, dimensions: ['page'], rowLimit: 50 }),
    query(a.externalId, token, { ...range, dimensions: ['date'], rowLimit: 40 }),
    query(a.externalId, token, { startDate: day(prevStart), endDate: day(prevEnd), dimensions: ['date'], rowLimit: 40 }),
  ])
  return { from: range.startDate, to: range.endDate, totals: totals(daily), previous: totals(prevDaily), queries, pages }
}
