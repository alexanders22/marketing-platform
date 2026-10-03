import 'server-only'
import { prisma } from './prisma'
import { resultLabel } from './meta-ads'

// Forecasts come from the account's own last 90 days, never from invented
// benchmarks. Without enough history there is no forecast — the plan says
// so and the goals take over after the first week of delivery.

const MIN_SPEND_DAYS = 7
// Results are uncertain: show a range around the history-based estimate.
const SPREAD = 0.25

export const OBJECTIVE_RESULT: Record<string, string> = {
  SALES: 'omni_purchase',
  LEADS: 'lead',
  TRAFFIC: 'link_click',
  AWARENESS: 'reach',
  ENGAGEMENT: 'post_engagement',
}

// Result types that count as the same thing.
const SAME: Record<string, string[]> = {
  omni_purchase: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
  lead: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'],
  link_click: ['link_click'],
  reach: ['reach'],
  post_engagement: ['post_engagement', 'onsite_conversion.messaging_conversation_started_7d'],
}

export type Benchmarks = {
  days: number
  spend: number
  cpm: number
  ctr: number
  reachPerImpression: number
  costPerResult: Record<string, number>
  currency: string | null
}

export async function benchmarks(workspaceId: string): Promise<Benchmarks | null> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const rows = await prisma.adInsightDay.findMany({
    where: { campaign: { workspaceId }, date: { gte: since }, spend: { gt: 0 } },
    include: { campaign: { select: { currency: true } } },
  })
  const days = new Set(rows.map((r) => r.date)).size
  if (days < MIN_SPEND_DAYS) return null
  const t = rows.reduce((s, r) => ({ spend: s.spend + r.spend, impressions: s.impressions + r.impressions, clicks: s.clicks + r.clicks, reach: s.reach + r.reach }), {
    spend: 0,
    impressions: 0,
    clicks: 0,
    reach: 0,
  })
  if (!t.impressions) return null
  const costPerResult: Record<string, number> = {}
  for (const [key, types] of Object.entries(SAME)) {
    const list = rows.filter((r) => r.resultType && types.includes(r.resultType))
    const spend = list.reduce((s, r) => s + r.spend, 0)
    const results = list.reduce((s, r) => s + r.results, 0)
    if (results >= 5) costPerResult[key] = spend / results
  }
  return {
    days,
    spend: t.spend,
    cpm: (t.spend / t.impressions) * 1000,
    ctr: t.clicks / t.impressions,
    reachPerImpression: Math.min(1, t.reach / t.impressions),
    costPerResult,
    currency: rows[0]?.campaign.currency ?? null,
  }
}

export type Forecast = {
  spend: number
  impressions: [number, number]
  reach: [number, number]
  clicks: [number, number]
  results: [number, number] | null
  resultLabel: string
  costPerResult: [number, number] | null
  basis: string
}

const range = (v: number): [number, number] => [Math.round(v * (1 - SPREAD)), Math.round(v * (1 + SPREAD))]
const money = (v: number): [number, number] => [Math.round(v * (1 - SPREAD) * 100) / 100, Math.round(v * (1 + SPREAD) * 100) / 100]

export function forecast(b: Benchmarks, spend: number, objective: string): Forecast {
  const impressions = (spend / b.cpm) * 1000
  const type = OBJECTIVE_RESULT[objective] ?? 'lead'
  const cpr = type === 'reach' ? null : b.costPerResult[type]
  return {
    spend,
    impressions: range(impressions),
    // Daily reach adds up over days; a long campaign reaches fewer new people
    // per impression, so this stays an upper bound.
    reach: range(impressions * b.reachPerImpression),
    clicks: range(impressions * b.ctr),
    results: type === 'reach' ? range(impressions * b.reachPerImpression) : cpr ? range(spend / cpr) : null,
    resultLabel: resultLabel(type),
    // Cheaper end of cost goes with the higher end of results.
    costPerResult: cpr ? money(cpr) : null,
    basis: `Your last ${b.days} days of ads: CPM ${b.cpm.toFixed(2)}, CTR ${(b.ctr * 100).toFixed(2)}%${cpr ? `, ${resultLabel(type).toLowerCase()} at ${cpr.toFixed(2)}` : ''}.`,
  }
}
