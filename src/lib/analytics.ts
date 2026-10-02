import 'server-only'
import { prisma } from './prisma'
import { resultLabel } from './meta-ads'
import { dayIn, isValidTimeZone } from './time'

// Numbers behind /app/dashboard: paid (AdInsightDay) and organic
// (PostDelivery metrics) for a period, the same-length period before it,
// daily series, campaign rows and top posts.

export const PERIODS = [7, 30, 90] as const
export type Period = (typeof PERIODS)[number]

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const daysBetween = (from: string, to: string) => {
  const out: string[] = []
  for (let d = from; d <= to; d = shift(d, 1)) out.push(d)
  return out
}
const ratio = (a: number, b: number) => (b > 0 ? a / b : null)
const mul = (v: number | null, k: number) => (v === null ? null : v * k)

export type Totals = {
  spend: number
  impressions: number
  clicks: number
  results: number
  revenue: number
  posts: number
  organicReach: number
  organicViews: number
  engagements: number
}

type Metrics = { reach?: number; views?: number; interactions?: number; likes?: number; comments?: number; shares?: number; saves?: number }
const engagementOf = (m: Metrics) => m.interactions ?? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0)

export async function dashboard(workspaceId: string, period: Period, now = new Date()) {
  const ads = await prisma.socialAccount.findMany({
    where: { workspaceId, network: 'META_ADS' },
    select: { id: true, name: true, status: true, syncedAt: true, lastError: true, meta: true },
  })
  const organic = await prisma.socialAccount.count({ where: { workspaceId, network: { in: ['FACEBOOK', 'INSTAGRAM'] } } })

  // Days are counted in the (first) ad account's time zone so they line up
  // with Meta's own reports.
  const tzRaw = (ads[0]?.meta as { timeZone?: string } | null)?.timeZone
  const tz = tzRaw && isValidTimeZone(tzRaw) ? tzRaw : 'UTC'
  const to = dayIn(now, tz)
  const from = shift(to, -(period - 1))
  const prevFrom = shift(from, -period)
  const prevTo = shift(from, -1)

  const campaigns = await prisma.adCampaign.findMany({
    where: { workspaceId },
    include: { days: { where: { date: { gte: prevFrom, lte: to } } }, socialAccount: { select: { name: true } } },
  })

  const currencies = new Map<string, number>()
  const total = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, results: 0, revenue: 0, posts: 0, organicReach: 0, organicViews: 0, engagements: 0 })
  const cur = total()
  const prev = total()
  const series = new Map(daysBetween(from, to).map((d) => [d, { date: d, spend: 0, results: 0, organicReach: 0, engagements: 0 }]))
  // Per result type (leads, purchases …): spend and results, to pick the
  // main one — summing leads with reach would mean nothing.
  const byType = new Map<string, { spend: number; results: number; prevSpend: number; prevResults: number; days: Map<string, number> }>()

  const rows = campaigns.map((c) => {
    const inPeriod = c.days.filter((d) => d.date >= from)
    const before = c.days.filter((d) => d.date < from)
    const sum = (list: typeof c.days) =>
      list.reduce(
        (s, d) => ({
          spend: s.spend + d.spend,
          impressions: s.impressions + d.impressions,
          clicks: s.clicks + d.clicks,
          results: s.results + d.results,
          revenue: s.revenue + d.revenue,
        }),
        { spend: 0, impressions: 0, clicks: 0, results: 0, revenue: 0 },
      )
    const a = sum(inPeriod)
    const b = sum(before)
    for (const k of ['spend', 'impressions', 'clicks', 'results', 'revenue'] as const) {
      cur[k] += a[k]
      prev[k] += b[k]
    }
    for (const d of inPeriod) {
      const s = series.get(d.date)
      if (s) s.spend += d.spend
    }
    const type = c.days.find((d) => d.resultType)?.resultType ?? null
    if (type) {
      const key = resultLabel(type)
      const t = byType.get(key) ?? { spend: 0, results: 0, prevSpend: 0, prevResults: 0, days: new Map<string, number>() }
      t.spend += a.spend
      t.results += a.results
      t.prevSpend += b.spend
      t.prevResults += b.results
      for (const d of inPeriod) t.days.set(d.date, (t.days.get(d.date) ?? 0) + d.results)
      byType.set(key, t)
    }
    if (c.currency) currencies.set(c.currency, (currencies.get(c.currency) ?? 0) + a.spend)
    const byDay = new Map(inPeriod.map((d) => [d.date, d.spend]))
    return {
      id: c.id,
      name: c.name,
      account: c.socialAccount.name,
      status: c.status,
      objective: c.objective,
      currency: c.currency,
      dailyBudget: c.dailyBudget,
      lifetimeBudget: c.lifetimeBudget,
      resultLabel: resultLabel(type),
      ...a,
      prevSpend: b.spend,
      prevResults: b.results,
      // Reach campaigns: cost per 1,000 people reached.
      costPerResult: type === 'reach' ? mul(ratio(a.spend, a.results), 1000) : ratio(a.spend, a.results),
      prevCostPerResult: type === 'reach' ? mul(ratio(b.spend, b.results), 1000) : ratio(b.spend, b.results),
      perThousand: type === 'reach',
      ctr: ratio(a.clicks, a.impressions),
      spark: daysBetween(from, to).map((d) => byDay.get(d) ?? 0),
    }
  })

  // Running campaigns first, then whatever spent in the period.
  const shown = rows
    .filter((r) => r.status === 'ACTIVE' || r.spend > 0)
    .sort((x, y) => Number(y.status === 'ACTIVE') - Number(x.status === 'ACTIVE') || y.spend - x.spend)

  // Organic: posts published in either period, with their latest metrics.
  const startUtc = new Date(`${prevFrom}T00:00:00Z`)
  const deliveries = await prisma.postDelivery.findMany({
    where: { status: 'PUBLISHED', createdAt: { gte: new Date(startUtc.getTime() - 86_400_000) }, post: { workspaceId } },
    include: { post: { select: { id: true, content: true, mediaIds: true } }, socialAccount: { select: { network: true, name: true } } },
  })
  const posts: {
    id: string
    deliveryId: string
    text: string
    image: string | null
    network: string
    account: string
    permalink: string | null
    date: string
    reach: number
    engagements: number
  }[] = []
  for (const d of deliveries) {
    const day = dayIn(d.createdAt, tz)
    const m = (d.metrics ?? {}) as Metrics
    const target = day >= from && day <= to ? cur : day >= prevFrom && day <= prevTo ? prev : null
    if (!target) continue
    target.posts++
    target.organicReach += m.reach ?? 0
    target.organicViews += m.views ?? 0
    target.engagements += engagementOf(m)
    if (target === cur) {
      const s = series.get(day)
      if (s) {
        s.organicReach += m.reach ?? 0
        s.engagements += engagementOf(m)
      }
      posts.push({
        id: d.post.id,
        deliveryId: d.id,
        text: d.post.content.slice(0, 140),
        image: d.post.mediaIds[0] ? `/media/${d.post.mediaIds[0]}` : null,
        network: d.socialAccount.network,
        account: d.socialAccount.name,
        permalink: d.permalink,
        date: day,
        reach: m.reach ?? 0,
        engagements: engagementOf(m),
      })
    }
  }
  posts.sort((a, b) => b.engagements - a.engagements || b.reach - a.reach)

  const currency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  // Main result: the type most money went to; reach only if nothing else.
  const ranked = [...byType.entries()].sort((a, b) => b[1].spend + b[1].prevSpend - (a[1].spend + a[1].prevSpend))
  const main = ranked.find(([k]) => k !== 'People reached') ?? ranked[0]
  if (main) {
    cur.results = main[1].results
    prev.results = main[1].prevResults
    for (const [day, v] of main[1].days) {
      const s = series.get(day)
      if (s) s.results = v
    }
  } else {
    cur.results = prev.results = 0
  }

  return {
    period,
    from,
    to,
    timeZone: tz,
    currency,
    mixedCurrencies: currencies.size > 1,
    resultLabel: main?.[0] ?? 'Results',
    // Spend of the campaigns behind the main result, for cost per result.
    resultSpend: { current: main?.[1].spend ?? 0, previous: main?.[1].prevSpend ?? 0 },
    connected: { ads: ads.length, organic },
    adAccounts: ads.map((a) => ({ id: a.id, name: a.name, status: a.status, syncedAt: a.syncedAt, lastError: a.lastError })),
    current: cur,
    previous: prev,
    series: [...series.values()],
    campaigns: shown,
    topPosts: posts.slice(0, 6),
  }
}

export type Dashboard = Awaited<ReturnType<typeof dashboard>>

// Plain facts for the AI summary — no ids, nothing personal.
export function summaryFacts(d: Dashboard) {
  const c = d.current
  const p = d.previous
  return {
    period: `${d.from} to ${d.to} (${d.period} days)`,
    currency: d.currency,
    paid: {
      spend: c.spend,
      previousSpend: p.spend,
      results: c.results,
      previousResults: p.results,
      resultLabel: d.resultLabel,
      costPerResult: ratio(d.resultSpend.current, c.results),
      previousCostPerResult: ratio(d.resultSpend.previous, p.results),
      ctr: ratio(c.clicks, c.impressions),
      previousCtr: ratio(p.clicks, p.impressions),
      // Revenue only when purchases are tracked; a zero here misleads.
      ...(c.revenue > 0 || p.revenue > 0 ? { revenue: c.revenue, previousRevenue: p.revenue } : {}),
      campaigns: d.campaigns.slice(0, 10).map((r) => ({
        name: r.name,
        status: r.status,
        objective: r.objective,
        spend: r.spend,
        results: r.results,
        resultLabel: r.resultLabel,
        [r.perThousand ? 'costPer1000Reached' : 'costPerResult']: r.costPerResult,
        [r.perThousand ? 'previousCostPer1000Reached' : 'previousCostPerResult']: r.prevCostPerResult,
        ctr: r.ctr,
        dailyBudget: r.dailyBudget,
      })),
    },
    organic: {
      posts: c.posts,
      previousPosts: p.posts,
      reach: c.organicReach,
      previousReach: p.organicReach,
      engagements: c.engagements,
      previousEngagements: p.engagements,
      topPosts: d.topPosts.slice(0, 3).map((t) => ({ network: t.network, text: t.text, reach: t.reach, engagements: t.engagements })),
    },
  }
}
