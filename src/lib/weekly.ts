import 'server-only'
import type { Recommendation } from '@prisma/client'
import { aiEnabled, weeklyReview, type ReviewRec } from './ai'
import { raiseAlert } from './alerts'
import { withDossier, workspaceTimeZone } from './dossier'
import { createGoalFor } from './goal-input'
import { METRICS } from './goal-metrics'
import { resultLabel } from './meta-ads'
import { prisma } from './prisma'
import { dayIn, zonedToUtc } from './time'

// The weekly loop: every Monday Khma looks back at the last seven days
// (Mon–Sun in the workspace's zone), explains what happened and proposes
// next steps the owner applies or dismisses.

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() // 0 = Sunday
const round = (v: number | null, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d)
const ratio = (a: number, b: number) => (b > 0 ? a / b : null)

// The Mon–Sun week that ended most recently before `today`.
export function lastFullWeek(today: string) {
  const back = weekday(today) === 0 ? 7 : weekday(today)
  const end = shift(today, -back)
  return { start: shift(end, -6), end }
}

type M = { reach?: number; views?: number; likes?: number; comments?: number; shares?: number; saves?: number; engagements?: number; interactions?: number }
const eng = (m: M) => m.engagements ?? m.interactions ?? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0)

export async function weekFacts(workspaceId: string, start: string, end: string, tz: string) {
  const prevStart = shift(start, -7)
  const prevEnd = shift(start, -1)
  const from = zonedToUtc(+prevStart.slice(0, 4), +prevStart.slice(5, 7), +prevStart.slice(8, 10), 0, 0, tz)
  const to = zonedToUtc(+end.slice(0, 4), +end.slice(5, 7), +end.slice(8, 10), 23, 59, tz)

  // Ads per campaign, this week vs the one before.
  const campaigns = await prisma.adCampaign.findMany({
    where: { workspaceId },
    include: { days: { where: { date: { gte: prevStart, lte: end } } }, ads: { orderBy: { spend: 'desc' }, take: 4 } },
  })
  const sum = (list: (typeof campaigns)[number]['days']) =>
    list.reduce((s, d) => ({ spend: s.spend + d.spend, impressions: s.impressions + d.impressions, clicks: s.clicks + d.clicks, results: s.results + d.results }), {
      spend: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
    })
  const ads = campaigns
    .map((c) => {
      const cur = sum(c.days.filter((d) => d.date >= start))
      const prev = sum(c.days.filter((d) => d.date <= prevEnd))
      return {
        name: c.name,
        status: c.status,
        objective: c.objective,
        dailyBudget: c.dailyBudget,
        resultLabel: resultLabel(c.days.find((d) => d.resultType)?.resultType),
        thisWeek: { spend: round(cur.spend), results: cur.results, costPerResult: round(ratio(cur.spend, cur.results)), ctr: round(ratio(cur.clicks, cur.impressions), 4), cpm: round(ratio(cur.spend * 1000, cur.impressions)) },
        weekBefore: { spend: round(prev.spend), results: prev.results, costPerResult: round(ratio(prev.spend, prev.results)), ctr: round(ratio(prev.clicks, prev.impressions), 4) },
        ads: c.ads.map((a) => ({ name: a.name, headline: a.title, status: a.status, spend90d: round(a.spend), results90d: a.results, ctr90d: round(ratio(a.clicks, a.impressions), 4) })),
      }
    })
    .filter((c) => c.status === 'ACTIVE' || (c.thisWeek.spend ?? 0) > 0 || (c.weekBefore.spend ?? 0) > 0)

  // Posts: imported history plus Khma deliveries not imported yet.
  const posts = await prisma.socialPost.findMany({ where: { workspaceId, publishedAt: { gte: from, lte: to } }, orderBy: { publishedAt: 'asc' } })
  const known = new Set(posts.map((p) => p.externalId))
  const deliveries = await prisma.postDelivery.findMany({
    where: { status: 'PUBLISHED', createdAt: { gte: from, lte: to }, post: { workspaceId } },
    include: { post: { select: { content: true } }, socialAccount: { select: { network: true } } },
  })
  const all = [
    ...posts.map((p) => ({ day: dayIn(p.publishedAt, tz), network: p.network, format: p.format, text: p.text, m: p.metrics as M })),
    ...deliveries
      .filter((d) => !d.externalId || !known.has(d.externalId))
      .map((d) => ({ day: dayIn(d.createdAt, tz), network: d.socialAccount.network, format: 'POST', text: d.post.content, m: (d.metrics ?? {}) as M })),
  ]
  const organic = (list: typeof all) => ({
    posts: list.length,
    reach: list.reduce((s, p) => s + (p.m.reach ?? 0), 0),
    engagements: list.reduce((s, p) => s + eng(p.m), 0),
  })
  const thisWeek = all.filter((p) => p.day >= start)
  const prevWeek = all.filter((p) => p.day <= prevEnd)

  const [upcoming, goals, alerts, plans] = await Promise.all([
    prisma.post.count({ where: { workspaceId, kind: 'SOCIAL', scheduledAt: { gt: to, lte: new Date(to.getTime() + 7 * 86_400_000) } } }),
    prisma.goal.findMany({ where: { workspaceId, active: true } }),
    prisma.alert.findMany({ where: { workspaceId, createdAt: { gte: from, lte: to } }, select: { title: true, severity: true } }),
    prisma.strategyPlan.findMany({ where: { workspaceId, status: 'ACTIVE' }, select: { goal: true, title: true, startsOn: true, endsOn: true } }),
  ])
  const currency = campaigns.find((c) => c.currency)?.currency ?? null

  return {
    week: { from: start, to: end, timeZone: tz },
    nextWeek: { from: shift(end, 1), to: shift(end, 7), postsAlreadyPlanned: upcoming },
    currency,
    ads,
    organic: {
      thisWeek: organic(thisWeek),
      weekBefore: organic(prevWeek),
      posts: thisWeek
        .map((p) => ({ day: p.day, network: p.network, format: p.format, text: p.text.slice(0, 200), reach: p.m.reach ?? null, engagements: eng(p.m) }))
        .sort((a, b) => b.engagements - a.engagements)
        .slice(0, 10),
    },
    goals: goals.map((g) => ({ metric: g.metric, scope: g.scope, target: g.target, actual: g.actual, status: g.status })),
    alerts: alerts.map((a) => `${a.severity.toLowerCase()}: ${a.title}`),
    activePlans: plans,
  }
}

export type WeekFacts = Awaited<ReturnType<typeof weekFacts>>
export type ReviewData = { headline: string; summary: string; wins: { text: string; evidence: string }[]; issues: { text: string; evidence: string }[] }

// Recommendations that can't be trusted are dropped, not shown.
function validRec(r: ReviewRec, facts: WeekFacts) {
  if (r.kind === 'post' || r.kind === 'repeat') {
    return Boolean(r.post?.caption && r.post.date >= facts.nextWeek.from && r.post.date <= facts.nextWeek.to)
  }
  if (r.kind === 'goal') {
    const def = METRICS.find((m) => m.id === r.goal?.metric)
    return Boolean(def && r.goal && def.scopes.includes(r.goal.scope) && r.goal.target > 0 && (def.kind !== 'money' || facts.currency))
  }
  if (r.kind === 'budget' || r.kind === 'creative' || r.kind === 'pause') return facts.ads.some((c) => c.name === r.campaign)
  return true
}

export async function createReview(workspaceId: string, { now = new Date(), rolling = false } = {}) {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { brandKit: true } })
  const tz = await workspaceTimeZone(workspaceId)
  const today = dayIn(now, tz)
  // Monday run: the last Mon–Sun week. "Review now": the last 7 full days.
  const { start, end } = rolling ? { start: shift(today, -7), end: shift(today, -1) } : lastFullWeek(today)
  const facts = await weekFacts(workspaceId, start, end, tz)
  const language = ws.locale === 'ka' ? 'Georgian' : ws.locale === 'ru' ? 'Russian' : 'English'
  const draft = await weeklyReview(ws.name, await withDossier(ws.brandKit, workspaceId), facts, language)
  if (!draft.headline) throw new Error('Empty review')

  const recs = draft.recommendations.filter((r) => validRec(r, facts))
  const review = await prisma.$transaction(async (tx) => {
    // Older open recommendations make way for the new ones.
    await tx.recommendation.updateMany({ where: { workspaceId, status: 'OPEN' }, data: { status: 'EXPIRED', decidedAt: now } })
    return tx.weeklyReview.create({
      data: {
        workspaceId,
        weekStart: start,
        weekEnd: end,
        stats: facts,
        data: { headline: draft.headline, summary: draft.summary, wins: draft.wins, issues: draft.issues },
        recommendations: {
          create: recs.map((r) => {
            const { kind, title, why, impact, ...payload } = r
            return { workspaceId, kind, title, why, impact, payload }
          }),
        },
      },
    })
  })
  await raiseAlert({
    workspaceId,
    kind: 'weekly_review',
    severity: 'INFO',
    title: `Weekly review: ${draft.headline}`.slice(0, 200),
    body: `${draft.summary.slice(0, 600)} ${recs.length} recommendation${recs.length === 1 ? '' : 's'} are waiting.`,
    href: '/app/weekly',
    dedupeKey: `review:${review.id}`,
  })
  return review
}

// Hourly by the ticker: each workspace once per week, on Monday from 07:00
// its time (or later in the week if it was missed). Automatic reviews can be
// switched off with KHMA_AUTO_REVIEW=off.
export async function reviewsDue(now = new Date(), limit = 3) {
  if (process.env.KHMA_AUTO_REVIEW === 'off' || !aiEnabled()) return 0
  // Active customers with something to review.
  const candidates = await prisma.workspace.findMany({
    where: { accountId: { not: null }, OR: [{ socialAccounts: { some: { status: 'ACTIVE' } } }, { posts: { some: { status: 'PUBLISHED' } } }] },
    select: { id: true, weeklyReviews: { orderBy: { weekEnd: 'desc' }, take: 1, select: { weekEnd: true } } },
    take: 500,
  })
  let done = 0
  for (const c of candidates) {
    if (done >= limit) break
    const tz = await workspaceTimeZone(c.id)
    const today = dayIn(now, tz)
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now))
    const { end } = lastFullWeek(today)
    if (c.weeklyReviews[0]?.weekEnd && c.weeklyReviews[0].weekEnd >= end) continue
    if (weekday(today) === 1 && hour < 7) continue
    try {
      await createReview(c.id, { now })
      done++
    } catch (e) {
      console.error('weekly review failed', c.id, e instanceof Error ? e.message : e)
    }
  }
  return done
}

/* ─── Acting on recommendations ────────────────────────────────────────── */

export async function applyRecommendation(rec: Recommendation): Promise<{ error?: string; ref?: string }> {
  if (rec.status !== 'OPEN') return { error: 'Already handled' }
  const p = rec.payload as Omit<ReviewRec, 'kind' | 'title' | 'why' | 'impact'>
  let ref: string | undefined
  if ((rec.kind === 'post' || rec.kind === 'repeat') && p.post) {
    const tz = await workspaceTimeZone(rec.workspaceId)
    const [y, m, d] = p.post.date.split('-').map(Number)
    const [hh, mm] = p.post.time.split(':').map(Number)
    const post = await prisma.post.create({
      data: {
        workspaceId: rec.workspaceId,
        kind: 'SOCIAL',
        status: 'DRAFT',
        content: p.post.caption,
        hashtags: p.post.hashtags,
        channels: [p.post.network],
        scheduledAt: zonedToUtc(y, m, d, hh, mm, tz),
        aiGenerated: true,
      },
    })
    ref = post.id
  } else if (rec.kind === 'goal' && p.goal) {
    const res = await createGoalFor(rec.workspaceId, p.goal)
    if (res.error) return { error: res.error }
    ref = res.goal!.id
  }
  // Budget, creative, pause, other: the owner did it; we record that.
  await prisma.recommendation.update({ where: { id: rec.id }, data: { status: 'APPLIED', appliedRef: ref ?? null, decidedAt: new Date() } })
  return { ref }
}

export async function dismissRecommendation(rec: Recommendation) {
  if (rec.status !== 'OPEN') return
  await prisma.recommendation.update({ where: { id: rec.id }, data: { status: 'DISMISSED', decidedAt: new Date() } })
}
