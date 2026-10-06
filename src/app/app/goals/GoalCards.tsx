import Link from 'next/link'
import type { Goal } from '@prisma/client'
import { AlertTriangle, CheckCircle2, CircleDashed, Flame, Globe, Megaphone, XCircle } from 'lucide-react'
import { SiFacebook, SiInstagram } from 'react-icons/si'
import { Ring } from '@/components/viz'
import { WINDOWS, formatMetric, metricDef } from '@/lib/goal-metrics'
import { goalHref } from '@/lib/goals'
import { goalName } from './GoalList'
import { GoalRowActions } from './GoalRowActions'

// Status: color + icon + words, never color alone.
export const STATUS = {
  ON_TRACK: { label: 'On track', ring: '#059669', track: '#d1fae5', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: CheckCircle2, cell: 'bg-emerald-500', edge: 'from-emerald-400 to-teal-400' },
  AT_RISK: { label: 'At risk', ring: '#d97706', track: '#fef3c7', pill: 'bg-amber-50 text-amber-800 ring-amber-200', icon: AlertTriangle, cell: 'bg-amber-400', edge: 'from-amber-300 to-orange-400' },
  OFF_TRACK: { label: 'Off track', ring: '#dc2626', track: '#fee2e2', pill: 'bg-red-50 text-red-700 ring-red-200', icon: XCircle, cell: 'bg-red-500', edge: 'from-red-400 to-rose-500' },
  NO_DATA: { label: 'No data yet', ring: '#a1a1aa', track: '#f4f4f5', pill: 'bg-zinc-100 text-zinc-600 ring-zinc-200', icon: CircleDashed, cell: 'bg-zinc-200', edge: 'from-zinc-200 to-zinc-300' },
} as const

type Row = Goal & { adCampaign: { name: string; currency: string | null } | null }

export const progressOf = (g: Pick<Goal, 'actual' | 'target' | 'atMost' | 'active'>) =>
  g.actual === null || !g.active ? 0 : g.atMost ? Math.min(1, g.target / Math.max(g.actual, 1e-9)) : Math.min(1, g.actual / g.target)

function ScopeIcon({ g }: { g: Row }) {
  if (g.scope === 'WEBSITE') return <Globe size={13} className="text-sky-600" />
  if (g.scope === 'CAMPAIGN' || g.scope === 'ADS') return <Megaphone size={13} className="text-violet-600" />
  if (g.network === 'INSTAGRAM') return <SiInstagram size={12} color="#E4405F" />
  if (g.network === 'FACEBOOK') return <SiFacebook size={12} color="#1877F2" />
  return (
    <span className="flex gap-0.5">
      <SiFacebook size={11} color="#1877F2" />
      <SiInstagram size={11} color="#E4405F" />
    </span>
  )
}

export function GoalCards({
  goals,
  currency,
  canEdit,
  history,
  streaks,
}: {
  goals: Row[]
  currency: string | null
  canEdit: boolean
  history: Record<string, { date: string; status: string | null }[]>
  streaks: Record<string, number>
}) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Goals">
      {goals.map((g) => {
        const def = metricDef(g.metric)
        if (!def) return null
        const cur = g.adCampaign?.currency ?? currency
        const fmt = (v: number) => formatMetric(v, def.kind, cur)
        const s = STATUS[g.active ? g.status : 'NO_DATA']
        const p = progressOf(g)
        const label = `${def.label} — ${goalName(g)}`
        const streak = streaks[g.id] ?? 0
        return (
          <li key={g.id} className={`relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,16,32,0.04)] ${g.active ? '' : 'opacity-60'}`}>
            <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${s.edge}`} />
            <span className="sr-only">{label}</span>
            <div className="flex gap-4">
              <Ring value={p} size={76} stroke={8} color={s.ring} track={s.track} label={`${label} progress`}>
                <span className="text-sm font-bold tabular-nums">{g.actual === null ? '—' : `${Math.round(p * 100)}%`}</span>
              </Ring>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-sm font-semibold">
                    <Link href={goalHref(g)} className="line-clamp-2 hover:underline">
                      {def.label}
                    </Link>
                  </p>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${s.pill}`}>
                    <s.icon size={12} /> {g.active ? s.label : 'Paused'}
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-zinc-500">
                  <ScopeIcon g={g} /> <span className="truncate">{goalName(g)}</span> · {WINDOWS.find((w) => w.days === g.windowDays)?.label.toLowerCase()}
                </p>
                <p className="mt-2 text-sm">
                  <b className="text-lg font-semibold tabular-nums">{g.actual === null ? '—' : fmt(g.actual)}</b>
                  <span className="text-zinc-400">
                    {' '}
                    / {g.atMost ? '≤' : '≥'} {fmt(g.target)}
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex flex-1 gap-[3px]" role="img" aria-label={`${label}: last 14 days`}>
                {(history[g.id] ?? []).map((d) => {
                  const st = d.status ? STATUS[d.status as keyof typeof STATUS] : null
                  return <span key={d.date} title={`${d.date}: ${st?.label ?? 'not checked'}`} className={`h-3 flex-1 rounded-[3px] ${st ? st.cell : 'bg-zinc-100'}`} />
                })}
              </div>
              {streak > 0 ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700" aria-label={`${streak}-day streak`}>
                  <Flame size={12} /> {streak}d
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-zinc-400">14 days</span>
              )}
              {canEdit && <GoalRowActions id={g.id} active={g.active} label={label} />}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
