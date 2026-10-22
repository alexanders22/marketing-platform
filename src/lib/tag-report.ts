import 'server-only'
import type { TagEvent, Visit } from '@prisma/client'
import { prisma } from './prisma'
import { CONVERSIONS, isDirect, isPaid } from './tag'

// What the Loudpilot Tag saw over a period: visits, conversions and money by
// where people came from, matched to ad campaigns and their spend, plus the
// paths of the people who converted.
//
// Attribution: a conversion belongs to the visit it happened in; when that
// visit was direct (typed the address, came back from a bookmark), to the
// person's last visit with a source in the 30 days before ("last non-direct
// click", as Google Analytics does).

const LOOKBACK_MS = 30 * 86_400_000

export type SourceRow = {
  key: string
  source: string
  medium: string
  campaign: string | null
  // The ad campaign the UTM campaign names (by id or name), with its spend.
  adCampaign: string | null
  spend: number | null
  currency: string | null
  paid: boolean
  visits: number
  leads: number
  purchases: number
  revenue: number
}

export type JourneyStep = { at: string; kind: 'visit' | 'page' | 'event'; text: string; detail?: string }
export type Journey = { visitorId: string; who: string; converted: string[]; revenue: number; steps: JourneyStep[] }

const channel = (v: Pick<Visit, 'source' | 'medium' | 'campaign'>) => ({
  source: v.source ?? '(direct)',
  medium: v.medium ?? '(none)',
  campaign: v.campaign,
})
const keyOf = (c: ReturnType<typeof channel>) => `${c.source}|${c.medium}|${c.campaign ?? ''}`

export const visitLabel = (v: Pick<Visit, 'source' | 'medium' | 'campaign' | 'clickKind'>) =>
  v.source ? `${v.source} / ${v.medium ?? '(none)'}${v.campaign ? ` · ${v.campaign}` : ''}` : 'Direct'

const path = (url: string | null) => {
  if (!url) return ''
  try {
    const u = new URL(url)
    return u.pathname + (u.search.length > 1 ? u.search.replace(/([?&](utm_[a-z]+|fbclid|gclid|ttclid|msclkid)=[^&]*)/g, '').replace(/^&/, '?') : '')
  } catch {
    return url
  }
}

export async function tagReport(siteId: string, workspaceId: string, days: number, now = new Date()) {
  const from = new Date(now.getTime() - days * 86_400_000)
  const [visits, conversions] = await Promise.all([
    prisma.visit.findMany({
      where: { siteId, test: false, startedAt: { gte: from } },
      select: { id: true, visitorId: true, source: true, medium: true, campaign: true, clickKind: true, startedAt: true },
    }),
    prisma.tagEvent.findMany({ where: { siteId, test: false, createdAt: { gte: from }, name: { in: CONVERSIONS } }, orderBy: { createdAt: 'asc' } }),
  ])

  // Every visit of the people who converted, to credit direct conversions.
  const people = [...new Set(conversions.map((c) => c.visitorId).filter((x): x is string => Boolean(x)))]
  const theirVisits = people.length
    ? await prisma.visit.findMany({
        where: { visitorId: { in: people }, test: false, startedAt: { gte: new Date(from.getTime() - LOOKBACK_MS) } },
        orderBy: { startedAt: 'asc' },
      })
    : []
  const byVisitor = new Map<string, Visit[]>()
  for (const v of theirVisits) byVisitor.set(v.visitorId, [...(byVisitor.get(v.visitorId) ?? []), v])
  const visitById = new Map(theirVisits.map((v) => [v.id, v]))

  const credit = (e: TagEvent) => {
    const own = e.visitId ? visitById.get(e.visitId) : undefined
    if (own && !isDirect(own)) return own
    const before = (byVisitor.get(e.visitorId ?? '') ?? []).filter((v) => v.startedAt <= e.createdAt && e.createdAt.getTime() - v.startedAt.getTime() <= LOOKBACK_MS && !isDirect(v))
    return before.at(-1) ?? own ?? null
  }

  const rows = new Map<string, SourceRow>()
  const row = (v: Pick<Visit, 'source' | 'medium' | 'campaign' | 'clickKind'> | null) => {
    // Server events for people never seen on the site.
    const c = v ? channel(v) : { source: '(no visit)', medium: 'server', campaign: null }
    const key = keyOf(c)
    let r = rows.get(key)
    if (!r) {
      r = { key, ...c, adCampaign: null, spend: null, currency: null, paid: v ? isPaid(v) : false, visits: 0, leads: 0, purchases: 0, revenue: 0 }
      rows.set(key, r)
    }
    if (v && isPaid(v)) r.paid = true
    return r
  }
  for (const v of visits) row(v).visits++
  let revenue = 0
  for (const e of conversions) {
    const r = row(credit(e))
    if (e.name === 'Purchase') {
      r.purchases++
      r.revenue += e.value ?? 0
      revenue += e.value ?? 0
    } else r.leads++
  }

  // UTM campaign → Loudpilot's copy of the ad campaign (by id, else name).
  const named = [...new Set([...rows.values()].map((r) => r.campaign).filter((c): c is string => Boolean(c)))]
  if (named.length) {
    const ads = await prisma.adCampaign.findMany({
      where: { workspaceId, OR: [{ externalId: { in: named } }, { name: { in: named } }] },
      include: { days: { where: { date: { gte: from.toISOString().slice(0, 10) } }, select: { spend: true } } },
    })
    for (const r of rows.values()) {
      const ad = ads.find((a) => a.externalId === r.campaign) ?? ads.find((a) => a.name === r.campaign)
      if (!ad) continue
      r.adCampaign = ad.name
      r.spend = ad.days.reduce((s, d) => s + d.spend, 0)
      r.currency = ad.currency
      r.paid = true
    }
  }

  const sources = [...rows.values()].sort((a, b) => b.leads + b.purchases - (a.leads + a.purchases) || b.visits - a.visits)
  const totals = {
    visits: visits.length,
    visitors: new Set(visits.map((v) => v.visitorId)).size,
    fromAds: visits.filter(isPaid).length,
    leads: conversions.filter((e) => e.name !== 'Purchase').length,
    purchases: conversions.filter((e) => e.name === 'Purchase').length,
    revenue,
    currency: conversions.find((e) => e.currency)?.currency ?? null,
  }
  return { totals, sources, journeys: await journeys(siteId, people.slice(-50).reverse()) }
}

// The path of each converted person: visits (with where from), pages and
// what they did, oldest first.
async function journeys(siteId: string, visitorIds: string[]): Promise<Journey[]> {
  if (!visitorIds.length) return []
  const visitors = await prisma.visitor.findMany({
    where: { id: { in: visitorIds }, siteId },
    include: {
      visits: { orderBy: { startedAt: 'desc' }, take: 6 },
      events: { orderBy: { createdAt: 'desc' }, take: 60 },
    },
  })
  return visitorIds.flatMap((id) => {
    const v = visitors.find((x) => x.id === id)
    if (!v) return []
    const steps: JourneyStep[] = [
      ...v.visits.map((x) => ({ at: x.startedAt.toISOString(), kind: 'visit' as const, text: visitLabel(x), detail: `${x.device ?? ''}${x.country ? ` · ${x.country}` : ''} · ${path(x.landingUrl)}` })),
      ...v.events.map((e) =>
        e.name === 'PageView'
          ? { at: e.createdAt.toISOString(), kind: 'page' as const, text: path(e.url), detail: e.title ?? undefined }
          : {
              at: e.createdAt.toISOString(),
              kind: 'event' as const,
              text: e.name,
              detail: [e.value != null ? `${e.value} ${e.currency ?? ''}`.trim() : '', e.source !== 'web' ? `from ${e.source}` : '', describe(e.props)].filter(Boolean).join(' · '),
            },
      ),
    ].sort((a, b) => a.at.localeCompare(b.at))
    const conv = v.events.filter((e) => CONVERSIONS.includes(e.name))
    return [
      {
        visitorId: v.id,
        who: [v.name, v.contact].filter(Boolean).join(' · ') || (v.userId ? `Customer ${v.userId}` : 'Anonymous visitor'),
        converted: [...new Set(conv.map((e) => e.name))],
        revenue: conv.filter((e) => e.name === 'Purchase').reduce((s, e) => s + (e.value ?? 0), 0),
        steps,
      },
    ]
  })
}

function describe(props: unknown) {
  if (!props || typeof props !== 'object') return ''
  const p = props as Record<string, unknown>
  return ['method', 'form', 'order_id', 'via']
    .filter((k) => p[k] != null && typeof p[k] !== 'object')
    .map((k) => `${k.replace('_', ' ')} ${String(p[k]).slice(0, 40)}`)
    .join(' · ')
}

// The newest events, for the live view on the Tag page.
export async function liveEvents(siteId: string, take = 25) {
  const events = await prisma.tagEvent.findMany({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { visit: { select: { source: true, medium: true, campaign: true, clickKind: true } } },
  })
  return events.map((e) => ({
    id: e.id,
    at: e.createdAt.toISOString(),
    name: e.name,
    page: path(e.url),
    from: e.visit ? visitLabel(e.visit) : e.source === 'server' ? 'Your server' : '—',
    value: e.value != null ? `${e.value} ${e.currency ?? ''}`.trim() : null,
    source: e.source,
    test: e.test,
    capi: e.capi,
  }))
}
