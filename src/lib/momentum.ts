import 'server-only'
import { prisma } from './prisma'

// Momentum: the Goals page's game layer. Points come only from real
// results and real work — goal-days on track, published posts, applied
// recommendations, launched plans — never from clicks. Streaks count days on
// which every checked goal was on track.

export const LEVELS = [
  { min: 0, name: 'Starter' },
  { min: 100, name: 'Explorer' },
  { min: 300, name: 'Rising star' },
  { min: 700, name: 'Pro' },
  { min: 1500, name: 'Expert' },
  { min: 3000, name: 'Master' },
  { min: 6000, name: 'Legend' },
] as const

export const POINTS = { goalDay: 10, post: 5, rec: 20, goal: 15, plan: 30 } as const

export type Badge = { id: string; name: string; hint: string; earned: boolean; icon: 'flag' | 'trophy' | 'flame' | 'zap' | 'target' | 'calendar' | 'sparkles' | 'plug' }

export type Momentum = {
  xp: number
  level: number
  levelName: string
  levelMin: number
  nextMin: number | null
  nextName: string | null
  streak: number
  bestStreak: number
  // Last 14 days, oldest first: share of checked goals on track (null = nothing checked).
  days: { date: string; onTrack: number; total: number }[]
  // Per goal, last 14 days of status, oldest first.
  history: Record<string, { date: string; status: string | null }[]>
  goalStreaks: Record<string, number>
  breakdown: { goalDays: number; posts: number; recs: number; goals: number; plans: number }
  badges: Badge[]
}

const day = (d: Date) => d.toISOString().slice(0, 10)
const shift = (s: string, n: number) => day(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000))

export function levelOf(xp: number) {
  let i = 0
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].min) i++
  return { level: i + 1, name: LEVELS[i].name, min: LEVELS[i].min, next: LEVELS[i + 1] ?? null }
}

// Consecutive days, ending today or yesterday, where `ok(date)` holds.
function streakEnding(dates: Set<string>, today: string) {
  let d = dates.has(today) ? today : shift(today, -1)
  let n = 0
  while (dates.has(d)) {
    n++
    d = shift(d, -1)
  }
  return n
}

function longest(dates: string[]) {
  const sorted = [...new Set(dates)].sort()
  let best = 0
  let run = 0
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && shift(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1
    best = Math.max(best, run)
  }
  return best
}

export async function momentumOf(workspaceId: string, now = new Date()): Promise<Momentum> {
  const today = day(now)
  const [goals, goalDays, posts, recs, plans, connected, weeklyPosts] = await Promise.all([
    prisma.goal.findMany({ where: { workspaceId }, select: { id: true, active: true, status: true } }),
    prisma.goalDay.findMany({ where: { goal: { workspaceId } }, select: { goalId: true, date: true, status: true }, orderBy: { date: 'asc' } }),
    prisma.post.count({ where: { workspaceId, status: 'PUBLISHED' } }),
    prisma.recommendation.count({ where: { workspaceId, status: 'APPLIED' } }),
    prisma.strategyPlan.count({ where: { workspaceId, status: { not: 'DRAFT' } } }),
    prisma.socialAccount.findMany({ where: { workspaceId, status: 'ACTIVE' }, select: { network: true } }),
    prisma.post.findMany({
      where: { workspaceId, status: 'PUBLISHED', publishedAt: { gte: new Date(now.getTime() - 28 * 86_400_000) } },
      select: { publishedAt: true },
    }),
  ])

  // Per day: how many checked goals, how many on track.
  const perDay = new Map<string, { onTrack: number; total: number }>()
  for (const g of goalDays) {
    if (g.status === 'NO_DATA') continue
    const x = perDay.get(g.date) ?? { onTrack: 0, total: 0 }
    x.total++
    if (g.status === 'ON_TRACK') x.onTrack++
    perDay.set(g.date, x)
  }
  const perfect = [...perDay.entries()].filter(([, v]) => v.total > 0 && v.onTrack === v.total).map(([d]) => d)
  const streak = streakEnding(new Set(perfect), today)
  const bestStreak = Math.max(streak, longest(perfect))

  const window = Array.from({ length: 14 }, (_, i) => shift(today, i - 13))
  const history: Momentum['history'] = {}
  const goalStreaks: Momentum['goalStreaks'] = {}
  for (const g of goals) {
    const mine = goalDays.filter((d) => d.goalId === g.id)
    const byDate = new Map(mine.map((d) => [d.date, d.status]))
    history[g.id] = window.map((date) => ({ date, status: byDate.get(date) ?? null }))
    goalStreaks[g.id] = streakEnding(new Set(mine.filter((d) => d.status === 'ON_TRACK').map((d) => d.date)), today)
  }

  const onTrackDays = goalDays.filter((d) => d.status === 'ON_TRACK').length
  const breakdown = { goalDays: onTrackDays, posts, recs, goals: goals.length, plans }
  const xp = onTrackDays * POINTS.goalDay + posts * POINTS.post + recs * POINTS.rec + goals.length * POINTS.goal + plans * POINTS.plan
  const lv = levelOf(xp)

  // At least 3 posts in each of the last 4 weeks.
  const weeks = [0, 1, 2, 3].map((w) => weeklyPosts.filter((p) => p.publishedAt && now.getTime() - p.publishedAt.getTime() < (w + 1) * 7 * 86_400_000 && now.getTime() - p.publishedAt.getTime() >= w * 7 * 86_400_000).length)
  const active = goals.filter((g) => g.active)
  const nets = new Set(connected.map((c) => c.network))
  const badges: Badge[] = [
    { id: 'first-goal', name: 'First goal', hint: 'Set your first goal', earned: goals.length > 0, icon: 'flag' },
    { id: 'first-win', name: 'First win', hint: 'A goal on track for a day', earned: onTrackDays > 0, icon: 'trophy' },
    { id: 'on-a-roll', name: 'On a roll', hint: '7 days in a row with every goal on track', earned: bestStreak >= 7, icon: 'flame' },
    { id: 'unstoppable', name: 'Unstoppable', hint: '30 days in a row with every goal on track', earned: bestStreak >= 30, icon: 'zap' },
    { id: 'full-house', name: 'Full house', hint: '3 or more goals, all on track right now', earned: active.length >= 3 && active.every((g) => g.status === 'ON_TRACK'), icon: 'target' },
    { id: 'consistent', name: 'Consistent', hint: '3+ posts a week for 4 weeks', earned: weeks.every((n) => n >= 3), icon: 'calendar' },
    { id: 'planner', name: 'Action taker', hint: 'Apply 5 weekly recommendations', earned: recs >= 5, icon: 'sparkles' },
    { id: 'connected', name: 'Full picture', hint: 'Ads, a social page and Google Analytics connected', earned: nets.has('META_ADS') && nets.has('GOOGLE_ANALYTICS') && (nets.has('FACEBOOK') || nets.has('INSTAGRAM')), icon: 'plug' },
  ]

  return {
    xp,
    level: lv.level,
    levelName: lv.name,
    levelMin: lv.min,
    nextMin: lv.next?.min ?? null,
    nextName: lv.next?.name ?? null,
    streak,
    bestStreak,
    days: window.map((date) => ({ date, ...(perDay.get(date) ?? { onTrack: 0, total: 0 }) })),
    history,
    goalStreaks,
    breakdown,
    badges,
  }
}
