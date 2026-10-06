import 'server-only'
import type { Campaign, StrategyPlan } from '@prisma/client'
import { utmCampaign } from './cta'
import { metricDef, formatMetric } from './goal-metrics'
import { prisma } from './prisma'
import type { PlanData } from './strategist'

// "What we wanted vs what we got" for a strategy plan or a social campaign:
// planned numbers (posts, budget, forecast, goal targets) next to the real
// ones (published posts and their reach, ad spend and results, website
// visits and key events), with a verdict per row.

export type Verdict = 'better' | 'on' | 'worse' | 'none'
export type Row = { label: string; planned: string; actual: string; verdict: Verdict; note?: string }
export type Comparison = { from: string; to: string; ended: boolean; rows: Row[] }

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 10) / 10))
const money = (n: number, cur: string | null) => formatMetric(n, 'money', cur)

// Higher is better unless `lower`; within ±10% of the plan is "on plan".
function verdict(actual: number | null, planned: number | null, lower = false): Verdict {
  if (actual === null || planned === null || planned === 0) return 'none'
  const r = actual / planned
  if (r >= 0.9 && r <= 1.1) return 'on'
  return (lower ? r < 0.9 : r > 1.1) ? 'better' : 'worse'
}
const inRange = (v: number, [lo, hi]: [number, number]): Verdict => (v >= lo && v <= hi ? 'on' : v > hi ? 'better' : 'worse')

async function published(postIds: string[]) {
  if (postIds.length === 0) return { count: 0, reach: 0, engagements: 0 }
  const rows = await prisma.postDelivery.findMany({ where: { postId: { in: postIds }, status: 'PUBLISHED' }, select: { postId: true, metrics: true } })
  let reach = 0
  let engagements = 0
  for (const r of rows) {
    const m = (r.metrics ?? {}) as Record<string, number>
    reach += m.reach ?? 0
    engagements += m.interactions ?? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0)
  }
  return { count: new Set(rows.map((r) => r.postId)).size, reach, engagements }
}

async function website(workspaceId: string, from: string, to: string, campaign?: string) {
  const days = await prisma.websiteDay.findMany({ where: { workspaceId, date: { gte: from, lte: to } }, select: { sessions: true, keyEvents: true, campaigns: true } })
  if (days.length === 0) return null
  if (!campaign) return { sessions: days.reduce((s, d) => s + d.sessions, 0), keyEvents: days.reduce((s, d) => s + d.keyEvents, 0) }
  let sessions = 0
  let keyEvents = 0
  for (const d of days) {
    for (const c of (d.campaigns ?? []) as { campaign: string; sessions: number; keyEvents: number }[]) {
      if (c.campaign.toLowerCase() === campaign) {
        sessions += c.sessions
        keyEvents += c.keyEvents
      }
    }
  }
  return { sessions, keyEvents }
}

const today = () => new Date().toISOString().slice(0, 10)

export async function campaignActuals(c: Campaign & { posts: { id: string }[] }): Promise<Comparison> {
  const from = c.startsOn.toISOString().slice(0, 10)
  const to = c.endsOn.toISOString().slice(0, 10)
  const until = to < today() ? to : today()
  const pub = await published(c.posts.map((p) => p.id))
  // Visits tagged with this campaign's utm_campaign, up to a week after it ends.
  const site = await website(c.workspaceId, from, shift(until, 7) > today() ? today() : shift(until, 7), utmCampaign(c.name))
  const rows: Row[] = [
    { label: 'Posts published', planned: fmt(c.posts.length), actual: fmt(pub.count), verdict: verdict(pub.count, c.posts.length) },
    { label: 'Reach of the posts', planned: '—', actual: fmt(pub.reach), verdict: 'none' },
    { label: 'Engagements', planned: '—', actual: fmt(pub.engagements), verdict: 'none', note: pub.reach ? `${((pub.engagements / pub.reach) * 100).toFixed(1)}% of reach` : undefined },
  ]
  if (site) {
    rows.push(
      { label: 'Website visits from the posts', planned: '—', actual: fmt(site.sessions), verdict: 'none', note: 'tagged with UTM' },
      { label: 'Key events from the posts', planned: '—', actual: fmt(site.keyEvents), verdict: 'none', note: 'sign-ups, leads, sales' },
    )
  }
  return { from, to, ended: to < today(), rows }
}

export async function planActuals(plan: StrategyPlan): Promise<Comparison> {
  const d = plan.data as unknown as PlanData
  const from = plan.startsOn
  const to = plan.endsOn
  const until = to < today() ? to : today()
  const rows: Row[] = []

  const ids = d.posts.flatMap((p) => (p.postId ? [p.postId] : []))
  const pub = await published(ids)
  rows.push({ label: 'Posts published', planned: fmt(d.posts.length), actual: fmt(pub.count), verdict: verdict(pub.count, d.posts.length) })
  if (pub.count) rows.push({ label: 'Reach of the posts', planned: '—', actual: fmt(pub.reach), verdict: 'none' })

  for (const ad of d.ads) {
    const link = (ad as { adCampaignId?: string }).adCampaignId
    if (!link) {
      rows.push({ label: `Ads · ${ad.name}`, planned: ad.budget ? money(ad.budget, plan.currency) : '—', actual: 'not linked', verdict: 'none', note: 'Link it to the running Meta campaign to compare' })
      continue
    }
    const days = await prisma.adInsightDay.findMany({ where: { campaignId: link, campaign: { workspaceId: plan.workspaceId }, date: { gte: from, lte: until } } })
    const spend = days.reduce((s, x) => s + x.spend, 0)
    const results = days.reduce((s, x) => s + x.results, 0)
    const reach = days.reduce((s, x) => s + x.reach, 0)
    rows.push({ label: `Ads · ${ad.name} · spend`, planned: ad.budget ? money(ad.budget, plan.currency) : '—', actual: money(spend, plan.currency), verdict: verdict(spend, ad.budget, true) })
    if (ad.forecast?.results) {
      rows.push({
        label: `Ads · ${ad.name} · ${ad.forecast.resultLabel.toLowerCase()}`,
        planned: `${fmt(ad.forecast.results[0])}–${fmt(ad.forecast.results[1])}`,
        actual: fmt(results),
        verdict: spend ? inRange(results, ad.forecast.results) : 'none',
      })
    }
    if (ad.forecast?.costPerResult && results) {
      const cpr = spend / results
      const [lo, hi] = ad.forecast.costPerResult
      rows.push({
        label: `Ads · ${ad.name} · cost per result`,
        planned: `${money(lo, plan.currency)}–${money(hi, plan.currency)}`,
        actual: money(cpr, plan.currency),
        verdict: cpr < lo ? 'better' : cpr > hi ? 'worse' : 'on',
      })
    }
    if (ad.forecast) rows.push({ label: `Ads · ${ad.name} · reach`, planned: `up to ${fmt(ad.forecast.reach[1])}`, actual: fmt(reach), verdict: 'none' })
  }

  const goalIds = d.goals.flatMap((g) => (g.goalId ? [g.goalId] : []))
  const goals = goalIds.length ? await prisma.goal.findMany({ where: { id: { in: goalIds } } }) : []
  for (const g of goals) {
    const def = metricDef(g.metric)
    if (!def) continue
    const f = (v: number) => formatMetric(v, def.kind, plan.currency)
    rows.push({
      label: `Goal · ${def.label}`,
      planned: `${g.atMost ? '≤' : '≥'} ${f(g.target)}`,
      actual: g.actual === null ? 'no data yet' : f(g.actual),
      verdict: g.status === 'ON_TRACK' ? 'on' : g.status === 'NO_DATA' ? 'none' : 'worse',
    })
  }

  const site = await website(plan.workspaceId, from, until)
  if (site) {
    const len = Math.round((Date.parse(until) - Date.parse(from)) / 86_400_000) + 1
    const before = await website(plan.workspaceId, shift(from, -len), shift(from, -1))
    rows.push({
      label: 'Website key events',
      planned: before ? `${fmt(before.keyEvents)} before` : '—',
      actual: fmt(site.keyEvents),
      verdict: before ? verdict(site.keyEvents, before.keyEvents) : 'none',
      note: 'vs the same number of days before the plan',
    })
  }
  return { from, to, ended: to < today(), rows }
}
