import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, CheckCircle2, CircleAlert, CircleDashed, Sparkles, Target, TriangleAlert, Wand2 } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { DeltaPill } from '@/components/viz'
import { appLang } from '@/lib/app-lang-server'
import { PERIODS, type Period } from '@/lib/analytics'
import { interviewState, type PilotState } from '@/lib/business'
import { requireContext } from '@/lib/context'
import { DASH, type DashCopy, type GoalState, type MetricKey } from '@/lib/dash-copy'
import { formatMoney, formatNumber } from '@/lib/format'
import { metricDef } from '@/lib/goal-metrics'
import { prisma } from '@/lib/prisma'
import { readinessOf } from '@/lib/readiness'
import { resultsOf } from '@/lib/results'
import { leaderboard } from '@/lib/benchmarks'
import { Leaderboard } from '../competitors/Leaderboard'
import { goalName } from '../goals/GoalList'
import { ProfileReadiness } from './ProfileReadiness'

export const metadata: Metadata = { title: 'Dashboard — Loudpilot' }

// The home page for someone who does not run ads for a living: is the
// business doing well, the few numbers that matter (explained in plain
// words, in their language), goals and what to do next. Every detail is in
// Analytics.

const card = 'rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,16,32,0.04)]'
const TONE = {
  good: { box: 'bg-emerald-50 ring-emerald-200', icon: CheckCircle2, ink: 'text-emerald-700' },
  steady: { box: 'bg-sky-50 ring-sky-200', icon: CircleDashed, ink: 'text-sky-700' },
  attention: { box: 'bg-amber-50 ring-amber-200', icon: CircleAlert, ink: 'text-amber-800' },
  setup: { box: 'bg-violet-50 ring-violet-200', icon: Sparkles, ink: 'text-violet-700' },
} as const
const GOAL_TONE: Record<GoalState, string> = {
  ON_TRACK: 'bg-emerald-50 text-emerald-700',
  AT_RISK: 'bg-amber-50 text-amber-800',
  OFF_TRACK: 'bg-red-50 text-red-700',
  NO_DATA: 'bg-zinc-100 text-zinc-600',
}

export default async function DashboardPage({ searchParams }: PageProps<'/app/dashboard'>) {
  const { workspace, brand, role } = await requireContext()
  const t = DASH[await appLang()]
  const q = await searchParams
  const days = (PERIODS.find((p) => String(p) === q.days) ?? 30) as Period
  const [r, goals, alerts, recs, ready, board, pilot] = await Promise.all([
    resultsOf(workspace.id, days),
    prisma.goal.findMany({ where: { workspaceId: workspace.id, active: true }, include: { adCampaign: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.alert.count({ where: { workspaceId: workspace.id, readAt: null, severity: { in: ['CRITICAL', 'WARNING'] } } }),
    prisma.recommendation.findMany({ where: { workspaceId: workspace.id, status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, title: true } }),
    readinessOf(workspace.id, brand),
    leaderboard(workspace.id),
    role === 'EDITOR' ? null : interviewState(workspace.id),
  ])
  const step = Object.fromEntries(r.steps.map((s) => [s.key, s])) as Record<(typeof r.steps)[number]['key'], (typeof r.steps)[number]>
  const money = (v: number) => formatMoney(v, r.money.currency, v >= 100 ? 0 : 2)

  // The banner: the period's main number (leads, else visits, else views) and the goals.
  const main = step.leads.value !== null ? { s: step.leads, noun: t.noun.leads } : step.visited.value !== null ? { s: step.visited, noun: t.noun.visits } : step.seen.value !== null ? { s: step.seen, noun: t.noun.views } : null
  const behind = goals.filter((g) => g.status === 'OFF_TRACK').length
  const pct = main && main.s.prev ? Math.round(((main.s.value! - main.s.prev) / main.s.prev) * 100) : null
  const state: keyof typeof TONE = !main ? 'setup' : behind > 0 || (pct !== null && pct <= -15) ? 'attention' : pct !== null && pct >= 5 ? 'good' : 'steady'
  const n = main ? formatNumber(main.s.value!) : ''
  const sentence = !main
    ? t.setupText
    : [pct === null ? t.first(main.noun, n, days) : Math.abs(pct) < 5 ? t.same(main.noun, n, days) : pct > 0 ? t.more(main.noun, n, pct, days) : t.less(main.noun, n, -pct, days), behind ? t.goalsBehind(behind) : '']
        .filter(Boolean)
        .join(' ')
  const tone = TONE[state]

  const metrics: { key: MetricKey; name: string; value: number | null; prev: number | null; shown?: string; line?: string; start: { href: string; label: string }; neutral?: boolean }[] = [
    { key: 'views', name: 'Views', value: step.seen.value, prev: step.seen.prev, start: { href: '/app/channels', label: t.connectMeta } },
    { key: 'clicks', name: 'Clicks', value: step.clicked.value, prev: step.clicked.prev, start: { href: '/app/channels', label: t.connectAds } },
    { key: 'visits', name: 'Website visits', value: step.visited.value, prev: step.visited.prev, start: { href: '/app/website/tag', label: t.installTag } },
    { key: 'leads', name: 'Leads', value: step.leads.value, prev: step.leads.prev, start: { href: '/app/website/tag', label: t.installTag } },
    {
      key: 'sales',
      name: 'Sales',
      value: step.customers.value,
      prev: step.customers.prev,
      line: r.money.revenue ? t.salesLine(formatMoney(r.money.revenue, r.money.currency, 0)) : undefined,
      start: { href: '/app/website/tag', label: t.installTag },
    },
    {
      key: 'spend',
      name: 'Ad spend',
      value: r.money.spend,
      prev: r.money.prevSpend,
      shown: r.money.spend === null ? undefined : money(r.money.spend),
      line: r.money.costPerLead !== null ? t.spendLine(money(r.money.costPerLead)) : undefined,
      start: { href: '/app/channels', label: t.connectAds },
      neutral: true,
    },
  ]
  const onTrack = goals.filter((g) => g.status === 'ON_TRACK').length
  const RANK = { OFF_TRACK: 3, AT_RISK: 2, NO_DATA: 1, ON_TRACK: 0 } as const
  const shownGoals = [...goals].sort((a, b) => RANK[b.status] - RANK[a.status]).slice(0, 3)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-500">{t.sub}</p>
        </div>
        <nav aria-label="Period" className="flex rounded-lg bg-zinc-100 p-1 text-sm">
          {PERIODS.map((p) => (
            <Link key={p} href={`/app/dashboard?days=${p}`} aria-current={p === days ? 'page' : undefined} className={`rounded-md px-3 py-1 font-medium ${p === days ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>
              {t.days(p)}
            </Link>
          ))}
        </nav>
        <Link href={`/app/analytics?days=${days}`} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50">
          {t.details} <ArrowRight size={14} />
        </Link>
      </div>

      {/* How the business is doing, in one sentence */}
      <section aria-label="How it is going" className={`flex flex-wrap items-center gap-3 rounded-2xl p-4 ring-1 ${tone.box}`}>
        <tone.icon size={22} className={`shrink-0 ${tone.ink}`} />
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${tone.ink}`} data-testid="health">
            {t.status[state]}
          </p>
          <p className="text-sm text-zinc-700">{sentence}</p>
        </div>
        {state === 'setup' && (
          <Link href="/app/channels" className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            {t.connect}
          </Link>
        )}
      </section>

      {/* The numbers that matter */}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Your numbers">
        {metrics.map((m) => (
          <li key={m.key} className={`${card} p-4`} aria-label={m.name}>
            <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-600">
              {m.name} <Hint text={t.metric[m.key].tip} label={`${t.whatIs} ${m.name}`} />
            </p>
            {m.value === null ? (
              <>
                <p className="mt-2 text-2xl font-semibold text-zinc-300">—</p>
                <p className="mt-1 text-xs text-zinc-500">{t.missing}</p>
                <Link href={m.start.href} className="mt-2 inline-block text-xs font-medium text-indigo-600 hover:underline">
                  {m.start.label} →
                </Link>
              </>
            ) : (
              <>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums" data-testid={`metric-${m.key}`} title={m.shown ?? m.value.toLocaleString('en-US')}>
                    {m.shown ?? formatNumber(m.value)}
                  </span>
                  <DeltaPill cur={m.value} prev={m.prev} neutral={m.neutral} label={t.compare} />
                </p>
                <p className="mt-1 text-sm text-zinc-500">{m.line ?? t.metric[m.key].line}</p>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Goals */}
        <Panel
          label={t.goals}
          title={
            <>
              <Target size={16} className="text-emerald-600" /> {t.goals} <Hint text={t.goalsTip} label={`${t.whatIs} ${t.goals}`} />
            </>
          }
          link={{ href: '/app/goals', label: goals.length ? t.allGoals : t.setGoal }}
        >
          {goals.length === 0 ? (
            <p className="text-sm text-zinc-600">{t.noGoals}</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-zinc-700" data-testid="goals-on-track">
                {t.onTrack(onTrack, goals.length)}
              </p>
              <ul className="space-y-2" aria-label="Goals">
                {shownGoals.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 text-sm">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${GOAL_TONE[g.status]}`}>{t.goalStatus[g.status]}</span>
                    <span className="min-w-0 truncate">
                      {metricDef(g.metric)?.label ?? g.metric} · <span className="text-zinc-500">{goalName(g)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        {/* What to do next */}
        <Panel label={t.next} title={<><Sparkles size={16} className="text-violet-600" /> {t.next}</>} link={{ href: '/app/weekly', label: t.openReview }}>
          {alerts > 0 && (
            <Link href="/app/alerts" className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-100">
              <TriangleAlert size={15} /> {t.alerts(alerts)}
            </Link>
          )}
          {recs.length > 0 ? (
            <>
              <p className="mb-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">{t.fromReview}</p>
              <ol className="space-y-2">
                {recs.map((x, i) => (
                  <li key={x.id}>
                    <Link href="/app/weekly" className="flex items-start gap-2 text-sm hover:underline">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-zinc-900 text-[11px] font-bold text-white">{i + 1}</span>
                      {x.title}
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            alerts === 0 && <p className="text-sm text-zinc-600">{t.nothingNext}</p>
          )}
        </Panel>
      </div>

      <Leaderboard board={board} t={t.board} whatIs={t.whatIs} />

      <ProfileReadiness r={ready} t={t.readiness} />

      <PlanHero t={t} pilot={pilot} />
    </div>
  )
}

function Panel({ label, title, link, children }: { label: string; title: ReactNode; link: { href: string; label: string }; children: ReactNode }) {
  return (
    <section aria-label={label} className={`${card} p-5`}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="mr-auto flex items-center gap-2 font-semibold">{title}</h2>
        <Link href={link.href} className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:gap-1.5">
          {link.label} <ArrowRight size={14} />
        </Link>
      </div>
      {children}
    </section>
  )
}

// The AI strategist: say what you want, get a plan.
function PlanHero({ t, pilot }: { t: DashCopy; pilot: PilotState | null }) {
  const p = pilot ? t.pilot[pilot.state] : null
  return (
    <section aria-label="Make a plan" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1b1145] via-[#3b1a8f] to-[#7b3ff2] p-6 text-white">
      <div className="pointer-events-none absolute -top-20 -right-10 h-60 w-60 rounded-full bg-fuchsia-400/30 blur-3xl" />
      <div className="relative">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-violet-200 uppercase">
          <Wand2 size={14} /> {t.aiStrategist}
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">{t.want}</h2>
        {pilot && p && (
          <Link href={pilot.href} className="mt-4 flex items-center gap-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/20 transition hover:bg-white/15">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{p.title}</span>
              <span className="block text-xs text-violet-200">{typeof p.sub === 'function' ? p.sub(Math.round(pilot.progress * 100)) : p.sub}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-[#3b1a8f]">
              {p.cta} <ArrowRight size={14} />
            </span>
          </Link>
        )}
        <form action="/app/strategy/new" className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="want" className="sr-only">
            {t.want}
          </label>
          <input
            id="want"
            name="goal"
            required
            minLength={5}
            placeholder={t.placeholder}
            className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/95 px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-4 focus:ring-white/25"
          />
          <button className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#ff2e6e] to-[#ff5b14] px-5 py-3 text-sm font-semibold transition hover:brightness-110">
            {t.makePlan} <ArrowRight size={16} />
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {t.ideas.map((i) => (
            <Link key={i} href={`/app/strategy/new?goal=${encodeURIComponent(i)}`} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/90 ring-1 ring-white/15 transition hover:bg-white/20">
              {i}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
