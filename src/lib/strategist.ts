import 'server-only'
import type { StrategyPlan } from '@prisma/client'
import { generateStrategy, type StrategyDraft } from './ai'
import { dashboard } from './analytics'
import { computeStats, withDossier } from './dossier'
import { benchmarks, forecast, type Forecast } from './forecast'
import { createGoalFor } from './goal-input'
import { METRICS } from './goal-metrics'
import { prisma } from './prisma'
import { zonedToUtc } from './time'
import { holidaysBetween } from './holidays'

// Goal → plan: gathers what Loudpilot knows, asks the AI strategist, then checks
// and completes its answer (budgets in money, forecasts from history, only
// valid dates and goal metrics) before the owner sees it.

export const OBJECTIVES = [
  { id: 'SALES', label: 'More sales' },
  { id: 'LEADS', label: 'More leads / enquiries' },
  { id: 'TRAFFIC', label: 'More website visits' },
  { id: 'AWARENESS', label: 'More people know us' },
  { id: 'ENGAGEMENT', label: 'More engagement and followers' },
] as const

export type PlanInput = {
  goal: string
  objective: (typeof OBJECTIVES)[number]['id']
  budget: number | null
  startsOn: string
  endsOn: string
  focus?: string
  language: 'English' | 'Georgian' | 'Russian'
  timeZone: string
}

export type PlanData = Omit<StrategyDraft, 'ads' | 'posts' | 'goals'> & {
  timeZone: string
  forecastNote: string
  ads: (StrategyDraft['ads'][number] & { budget: number | null; dailyBudget: number | null; forecast: Forecast | null; launched?: boolean; adCampaignId?: string | null })[]
  posts: (StrategyDraft['posts'][number] & { postId?: string })[]
  goals: (StrategyDraft['goals'][number] & { goalId?: string })[]
  // Pictures and videos being made for the posts (src/lib/plan-visuals.ts).
  visuals?: { status: 'RUNNING' | 'DONE'; total: number; startedAt: string; outOfCredits: boolean }
}

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1

export async function buildPlan(workspaceId: string, input: PlanInput, createdById?: string) {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { brandKit: true, account: true } })
  const [bench, stats, d30, campaigns, goals] = await Promise.all([
    benchmarks(workspaceId),
    computeStats(workspaceId),
    dashboard(workspaceId, 30),
    prisma.adCampaign.findMany({ where: { workspaceId, status: 'ACTIVE' }, select: { name: true, objective: true, dailyBudget: true } }),
    prisma.goal.findMany({ where: { workspaceId, active: true }, select: { metric: true, target: true, status: true } }),
  ])
  const currency = bench?.currency ?? d30.currency ?? ws.account?.currency ?? null
  const days = daysBetween(input.startsOn, input.endsOn)

  const brief = {
    goal: input.goal,
    objective: input.objective,
    focus: input.focus || null,
    period: { from: input.startsOn, to: input.endsOn, days },
    budget: input.budget ? { total: input.budget, currency } : null,
    connected: d30.connected,
    pastResults: {
      last30Days: { ...d30.current, resultLabel: d30.resultLabel, currency: d30.currency },
      ads90Days: bench ? { days: bench.days, cpm: bench.cpm, ctr: bench.ctr, costPerResult: bench.costPerResult } : 'no ad history',
      bestCreatives: stats.ads.bestCreatives.slice(0, 3),
      posting: {
        postsLast12Months: stats.posts.total,
        postsPerWeekLast12Weeks: stats.posts.postsPerWeek,
        formats: stats.posts.byFormat,
        weekdays: stats.posts.byWeekday,
        times: stats.posts.byTime,
        bestPosts: stats.posts.best.slice(0, 4),
      },
    },
    runningCampaigns: campaigns,
    existingGoals: goals,
    // Holidays and marketing moments in the period: plan posts and offers for them.
    holidaysInPeriod: holidaysBetween(input.startsOn, input.endsOn).map((h) => ({ date: h.date, name: h.name, idea: h.idea })),
  }
  const brand = await withDossier(ws.brandKit, workspaceId)
  const draft = await generateStrategy(ws.name, brand, brief, input.language)
  if (!draft.headline) throw new Error('Empty plan')

  // Posts: inside the first two weeks of the period, sorted.
  const lastPostDay = shift(input.startsOn, Math.min(13, days - 1))
  const posts = draft.posts
    .filter((p) => p.date >= input.startsOn && p.date <= lastPostDay && p.caption)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))

  // Money: shares → amounts; ad campaigns never exceed the budget or period.
  const total = input.budget ?? 0
  const adShare = draft.ads.reduce((s, a) => s + a.share, 0)
  const scale = adShare > 1 ? 1 / adShare : 1
  const ads = draft.ads.map((a) => {
    const runDays = Math.min(a.days, days)
    const budget = total ? Math.round(total * a.share * scale * 100) / 100 : null
    return {
      ...a,
      days: runDays,
      budget,
      dailyBudget: budget ? Math.round((budget / runDays) * 100) / 100 : null,
      forecast: bench && budget ? forecast(bench, budget, a.objective) : null,
    }
  })
  const splitSum = draft.budgetSplit.reduce((s, b) => s + b.share, 0) || 1

  // Goals: known metric, matching scope; money targets only with a currency.
  const validGoals = draft.goals.filter((g) => {
    const def = METRICS.find((m) => m.id === g.metric)
    return def && def.scopes.includes(g.scope) && g.target > 0 && (def.kind !== 'money' || currency) && (g.scope !== 'ADS' || d30.connected.ads > 0)
  })

  const data: PlanData = {
    ...draft,
    budgetSplit: draft.budgetSplit.map((b) => ({ ...b, share: b.share / splitSum })),
    ads,
    posts,
    goals: validGoals,
    timeZone: input.timeZone,
    forecastNote: bench
      ? `Forecasts use your own last ${bench.days} days of Meta ads, ±25%.`
      : 'No ad history yet — forecasts appear after the first week of delivery. Goals will track the real numbers from day one.',
  }

  return prisma.strategyPlan.create({
    data: {
      workspaceId,
      title: draft.headline.slice(0, 200),
      goal: input.goal,
      objective: input.objective,
      budget: input.budget,
      currency,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      data,
      createdById,
    },
  })
}

/* ─── Applying parts of a plan ─────────────────────────────────────────── */

const planData = (p: StrategyPlan) => p.data as unknown as PlanData

async function save(p: StrategyPlan, data: PlanData) {
  return prisma.strategyPlan.update({ where: { id: p.id }, data: { data: data as object, status: p.status === 'DRAFT' ? 'ACTIVE' : p.status } })
}

// Posts become Planner drafts at their date and time in the plan's zone.
export async function applyPosts(plan: StrategyPlan, ids?: string[]) {
  const data = planData(plan)
  let created = 0
  for (const p of data.posts) {
    if (p.postId || (ids && !ids.includes(p.id))) continue
    const [y, m, d] = p.date.split('-').map(Number)
    const [hh, mm] = p.time.split(':').map(Number)
    const post = await prisma.post.create({
      data: {
        workspaceId: plan.workspaceId,
        kind: 'SOCIAL',
        status: 'DRAFT',
        title: p.pillar || null,
        content: p.caption,
        hashtags: p.hashtags,
        channels: [p.network],
        scheduledAt: zonedToUtc(y, m, d, hh, mm, data.timeZone),
        aiGenerated: true,
      },
    })
    p.postId = post.id
    created++
  }
  await save(plan, data)
  return created
}

export async function applyGoals(plan: StrategyPlan, ids?: string[]) {
  const data = planData(plan)
  const errors: string[] = []
  let created = 0
  for (const g of data.goals) {
    if (g.goalId || (ids && !ids.includes(g.id))) continue
    const res = await createGoalFor(plan.workspaceId, {
      scope: g.scope,
      network: g.network ?? null,
      metric: g.metric,
      target: g.target,
      windowDays: g.windowDays,
    })
    if (res.goal) {
      g.goalId = res.goal.id
      created++
    } else if (res.error) errors.push(res.error)
  }
  await save(plan, data)
  return { created, errors }
}

export async function setAdLaunched(plan: StrategyPlan, adId: string, launched: boolean, adCampaignId?: string | null) {
  const data = planData(plan)
  const ad = data.ads.find((a) => a.id === adId)
  if (!ad) return false
  ad.launched = launched
  // The real Meta campaign it became, to compare plan and results.
  if (adCampaignId !== undefined) ad.adCampaignId = adCampaignId
  await save(plan, data)
  return true
}
