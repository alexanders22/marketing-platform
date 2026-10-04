import 'server-only'
import type { Goal, GoalStatus } from '@prisma/client'
import { raiseAlert } from './alerts'
import { classify, formatMetric, metricDef, WINDOWS } from './goal-metrics'
import { prisma } from './prisma'
import { dayIn, isValidTimeZone } from './time'
import { ACTIVE_WORKSPACE } from './pause'

// Goals are checked hourly over complete days (yesterday and before), so a
// morning with little delivery yet never looks like a failure. Posts count
// only once they are a day old, when most of their reach is in.

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const DAY = 86_400_000

type Sums = { spend: number; impressions: number; reach: number; clicks: number; results: number; revenue: number; days: number }

function adValue(metric: string, s: Sums): number | null {
  switch (metric) {
    case 'cost_per_result':
      return s.results > 0 ? s.spend / s.results : null
    case 'results':
      return s.results
    case 'spend':
      return s.spend
    case 'ctr':
      return s.impressions > 0 ? s.clicks / s.impressions : null
    case 'cpm':
      return s.impressions > 0 ? (s.spend / s.impressions) * 1000 : null
    case 'ad_impressions':
      return s.impressions
    case 'ad_reach':
      return s.reach
    case 'roas':
      return s.spend > 0 && s.revenue > 0 ? s.revenue / s.spend : null
  }
  return null
}

type PostSums = { posts: number; reach: number; views: number; likes: number; comments: number; shares: number; saves: number; engagements: number }

function postValue(metric: string, s: PostSums): number | null {
  const avg = (v: number) => (s.posts > 0 ? v / s.posts : null)
  switch (metric) {
    case 'posts':
      return s.posts
    case 'reach':
    case 'views':
    case 'likes':
    case 'comments':
    case 'shares':
    case 'saves':
    case 'engagements':
      return s[metric]
    case 'avg_reach':
      return avg(s.reach)
    case 'avg_views':
      return avg(s.views)
    case 'avg_engagements':
      return avg(s.engagements)
    case 'engagement_rate':
      return s.reach > 0 ? s.engagements / s.reach : null
  }
  return null
}

const pct = (a: number, b: number) => (b > 0 ? (a - b) / b : 0)

// Plain-language "why" from the window vs the one before it.
function adHint(cur: Sums, prev: Sums) {
  const ctr = (s: Sums) => (s.impressions ? s.clicks / s.impressions : 0)
  const cpm = (s: Sums) => (s.impressions ? (s.spend / s.impressions) * 1000 : 0)
  const conv = (s: Sums) => (s.clicks ? s.results / s.clicks : 0)
  if (prev.impressions > 0 && pct(ctr(cur), ctr(prev)) < -0.2)
    return `Click-through fell ${Math.round(-pct(ctr(cur), ctr(prev)) * 100)}% — the creative may be tiring. Try a new image or first line.`
  if (prev.impressions > 0 && pct(cpm(cur), cpm(prev)) > 0.2)
    return `Impressions got ${Math.round(pct(cpm(cur), cpm(prev)) * 100)}% more expensive — the audience may be saturated. Widen it or refresh the offer.`
  if (prev.clicks > 0 && cur.clicks > 0 && pct(conv(cur), conv(prev)) < -0.2)
    return 'People still click but convert less — check the landing page or lead form.'
  if (cur.results === 0 && cur.spend > 0) return 'Money is being spent with no results yet — check tracking and the form.'
  return ''
}

function postHint(cur: PostSums, prev: PostSums, metric: string) {
  if (cur.posts === 0) return 'Nothing was published in this period — schedule a few posts from the Planner.'
  if (prev.posts > 0 && cur.posts < prev.posts && ['reach', 'views', 'likes', 'engagements', 'comments', 'shares', 'saves'].includes(metric))
    return `You posted ${cur.posts} time${cur.posts === 1 ? '' : 's'} vs ${prev.posts} before — totals follow how often you post.`
  if (prev.posts > 0 && cur.reach / Math.max(1, cur.posts) < (prev.reach / prev.posts) * 0.8)
    return 'Each post reaches fewer people than before — try a different format (short video, carousel) or posting time.'
  return ''
}

export type GoalResult = { status: GoalStatus; actual: number | null; target: number; hint: string; currency: string | null }

export async function measureGoal(goal: Goal, now = new Date()): Promise<GoalResult> {
  const def = metricDef(goal.metric)
  if (!def) return { status: 'NO_DATA', actual: null, target: goal.target, hint: '', currency: null }
  const n = goal.windowDays

  if (goal.scope === 'POSTS') {
    const accounts = await prisma.socialAccount.count({
      where: { workspaceId: goal.workspaceId, network: goal.network ? (goal.network as 'FACEBOOK' | 'INSTAGRAM') : { in: ['FACEBOOK', 'INSTAGRAM'] } },
    })
    if (accounts === 0) return { status: 'NO_DATA', actual: null, target: goal.target, hint: '', currency: null }
    const end = new Date(now.getTime() - DAY)
    const sums = async (from: Date, to: Date): Promise<PostSums> => {
      const rows = await prisma.postDelivery.findMany({
        where: {
          status: 'PUBLISHED',
          createdAt: { gte: from, lt: to },
          post: { workspaceId: goal.workspaceId },
          ...(goal.network ? { socialAccount: { network: goal.network as 'FACEBOOK' | 'INSTAGRAM' } } : {}),
        },
        select: { postId: true, metrics: true },
      })
      const s: PostSums = { posts: new Set(rows.map((r) => r.postId)).size, reach: 0, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, engagements: 0 }
      for (const r of rows) {
        const m = (r.metrics ?? {}) as Record<string, number>
        s.reach += m.reach ?? 0
        s.views += m.views ?? 0
        s.likes += m.likes ?? 0
        s.comments += m.comments ?? 0
        s.shares += m.shares ?? 0
        s.saves += m.saves ?? 0
        s.engagements += m.interactions ?? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0)
      }
      return s
    }
    const cur = await sums(new Date(end.getTime() - n * DAY), end)
    const prev = await sums(new Date(end.getTime() - 2 * n * DAY), new Date(end.getTime() - n * DAY))
    const actual = postValue(goal.metric, cur)
    if (actual === null) return { status: 'NO_DATA', actual: null, target: goal.target, hint: '', currency: null }
    const status = classify(actual, goal.target, goal.atMost)
    return { status, actual, target: goal.target, hint: status === 'ON_TRACK' ? '' : postHint(cur, prev, goal.metric), currency: null }
  }

  // Ads: one campaign, or every campaign of the workspace.
  const campaigns = await prisma.adCampaign.findMany({
    where: goal.scope === 'CAMPAIGN' ? { id: goal.adCampaignId ?? '', workspaceId: goal.workspaceId } : { workspaceId: goal.workspaceId },
    include: { socialAccount: { select: { meta: true } } },
  })
  if (campaigns.length === 0) return { status: 'NO_DATA', actual: null, target: goal.target, hint: '', currency: null }
  const tzRaw = (campaigns[0].socialAccount.meta as { timeZone?: string } | null)?.timeZone
  const tz = tzRaw && isValidTimeZone(tzRaw) ? tzRaw : 'UTC'
  const last = shift(dayIn(now, tz), -1)
  const from = shift(last, -(n - 1))
  const prevFrom = shift(from, -n)
  const days = await prisma.adInsightDay.findMany({
    where: { campaignId: { in: campaigns.map((c) => c.id) }, date: { gte: prevFrom, lte: last } },
  })
  // Across several campaigns, results of reach campaigns are not added to
  // leads/purchases (same rule as the dashboard).
  const countResults = (t: string | null) => goal.scope === 'CAMPAIGN' || t !== 'reach'
  const sum = (list: typeof days): Sums => {
    const delivering = new Set(list.filter((d) => d.spend > 0).map((d) => d.date))
    return list.reduce(
      (s, d) => ({
        spend: s.spend + d.spend,
        impressions: s.impressions + d.impressions,
        reach: s.reach + d.reach,
        clicks: s.clicks + d.clicks,
        results: s.results + (countResults(d.resultType) ? d.results : 0),
        revenue: s.revenue + d.revenue,
        days: delivering.size,
      }),
      { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, revenue: 0, days: delivering.size },
    )
  }
  const cur = sum(days.filter((d) => d.date >= from))
  const prev = sum(days.filter((d) => d.date < from))
  const currency = campaigns[0].currency
  // Not delivering in the window: nothing to judge.
  if (cur.days === 0) return { status: 'NO_DATA', actual: null, target: goal.target, hint: '', currency }

  let actual = adValue(goal.metric, cur)
  if (goal.metric === 'cost_per_result' && actual === null) {
    // Spent at least the target price and got nothing: clearly off.
    if (cur.spend >= goal.target) actual = Infinity
    else return { status: 'NO_DATA', actual: null, target: goal.target, hint: '', currency }
  }
  if (actual === null) return { status: 'NO_DATA', actual: null, target: goal.target, hint: '', currency }
  // Totals are judged for the days the ads actually ran.
  const totals = ['results', 'ad_impressions', 'ad_reach', 'spend'].includes(goal.metric)
  const target = totals && cur.days < n ? (goal.target * cur.days) / n : goal.target
  const status = classify(actual, target, goal.atMost)
  return { status, actual: Number.isFinite(actual) ? actual : null, target, hint: status === 'ON_TRACK' ? '' : adHint(cur, prev), currency }
}

async function contextName(goal: Goal) {
  if (goal.scope === 'CAMPAIGN') {
    const c = goal.adCampaignId ? await prisma.adCampaign.findUnique({ where: { id: goal.adCampaignId }, select: { name: true } }) : null
    return c?.name ?? 'Ad campaign'
  }
  if (goal.scope === 'ADS') return 'All ads'
  return goal.network === 'INSTAGRAM' ? 'Instagram posts' : goal.network === 'FACEBOOK' ? 'Facebook posts' : 'Posts'
}

export function goalHref(goal: Goal) {
  return goal.scope === 'CAMPAIGN' && goal.adCampaignId ? `/app/dashboard/ads/${goal.adCampaignId}` : '/app/goals'
}

// Measure, store and alert on status changes. The first check of a new goal
// is silent — the owner is looking at it right then.
export async function checkGoal(goal: Goal, now = new Date()) {
  const r = await measureGoal(goal, now)
  await prisma.goal.update({ where: { id: goal.id }, data: { status: r.status, actual: r.actual, checkedAt: now } })
  if (!goal.checkedAt || r.status === goal.status) return r

  const def = metricDef(goal.metric)!
  const name = await contextName(goal)
  const window = WINDOWS.find((w) => w.days === goal.windowDays)?.label.toLowerCase() ?? `last ${goal.windowDays} days`
  const fmt = (v: number) => formatMetric(v, def.kind, r.currency)
  const day = now.toISOString().slice(0, 10)
  const base = { workspaceId: goal.workspaceId, goalId: goal.id, href: goalHref(goal), dedupeKey: `goal:${goal.id}:${r.status}:${day}` }

  if (r.status === 'OFF_TRACK' || (r.status === 'AT_RISK' && goal.status !== 'OFF_TRACK')) {
    const diff = r.actual === null ? null : Math.abs(r.actual - r.target) / r.target
    const side = goal.atMost ? 'above' : 'below'
    await raiseAlert({
      ...base,
      kind: r.status === 'OFF_TRACK' ? 'goal_off_track' : 'goal_at_risk',
      severity: r.status === 'OFF_TRACK' ? 'CRITICAL' : 'WARNING',
      title: `${def.label} ${side} target — ${name}`,
      body: [
        r.actual === null
          ? `No results while ${fmt(r.target)} or more was spent (${window}).`
          : `${fmt(r.actual)} for the ${window} vs target ${goal.atMost ? 'at most' : 'at least'} ${fmt(r.target)}${diff !== null ? ` (${Math.round(diff * 100)}% ${side})` : ''}.`,
        r.hint,
      ]
        .filter(Boolean)
        .join(' '),
    })
  } else if (r.status === 'ON_TRACK' && (goal.status === 'OFF_TRACK' || goal.status === 'AT_RISK')) {
    await raiseAlert({
      ...base,
      kind: 'goal_recovered',
      severity: 'INFO',
      title: `${def.label} back on target — ${name}`,
      body: `${r.actual === null ? '' : `${fmt(r.actual)} for the ${window}, `}target ${goal.atMost ? 'at most' : 'at least'} ${fmt(r.target)}.`,
    })
  }
  return r
}

export async function checkAllGoals(now = new Date()) {
  const goals = await prisma.goal.findMany({ where: { active: true, workspace: ACTIVE_WORKSPACE }, take: 2000 })
  for (const g of goals) {
    await checkGoal(g, now).catch((e) => console.error('goal check failed', g.id, e instanceof Error ? e.message : e))
  }
  return goals.length
}
