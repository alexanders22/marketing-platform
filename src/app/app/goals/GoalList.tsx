import Link from 'next/link'
import type { Goal } from '@prisma/client'
import { Globe } from 'lucide-react'
import { SiFacebook, SiInstagram } from 'react-icons/si'
import { LocalTime } from '@/components/LocalTime'
import { WINDOWS, formatMetric, metricDef } from '@/lib/goal-metrics'
import { goalHref } from '@/lib/goals'
import { GoalRowActions } from './GoalRowActions'

export const GOAL_STATUS = {
  ON_TRACK: { label: 'On track', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  AT_RISK: { label: 'At risk', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  OFF_TRACK: { label: 'Off track', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700', bar: 'bg-red-500' },
  NO_DATA: { label: 'No data yet', dot: 'bg-zinc-300', pill: 'bg-zinc-100 text-zinc-600', bar: 'bg-zinc-300' },
} as const

type Row = Goal & { adCampaign: { name: string; currency: string | null } | null }

export const goalName = (g: Pick<Goal, 'scope' | 'network'> & { adCampaign: { name: string } | null }) =>
  g.scope === 'CAMPAIGN'
    ? (g.adCampaign?.name ?? 'Campaign')
    : g.scope === 'ADS'
      ? 'All ads'
      : g.scope === 'WEBSITE'
        ? g.network
          ? `Website · ${g.network}`
          : 'Website'
        : g.network === 'INSTAGRAM'
          ? 'Instagram posts'
          : g.network === 'FACEBOOK'
            ? 'Facebook posts'
            : 'Facebook and Instagram posts'

// Goals with their latest check: target, actual, progress and status.
export function GoalList({ goals, currency, canEdit, compact = false }: { goals: Row[]; currency: string | null; canEdit: boolean; compact?: boolean }) {
  return (
    <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200" aria-label="Goals">
      {goals.map((g) => {
        const def = metricDef(g.metric)
        if (!def) return null
        const cur = g.adCampaign?.currency ?? currency
        const fmt = (v: number) => formatMetric(v, def.kind, cur)
        const s = GOAL_STATUS[g.active ? g.status : 'NO_DATA']
        const progress =
          g.actual === null || !g.active ? 0 : g.atMost ? Math.min(1, g.target / Math.max(g.actual, 1e-9)) : Math.min(1, g.actual / g.target)
        const label = `${def.label} — ${goalName(g)}`
        return (
          <li key={g.id} className={`flex flex-wrap items-center gap-4 ${compact ? 'p-3' : 'p-4'} ${g.active ? '' : 'opacity-60'}`}>
            <div className="min-w-0 flex-1 basis-64">
              <p className="flex items-center gap-2 text-sm font-medium">
                {g.scope === 'POSTS' && (g.network === 'INSTAGRAM' ? <SiInstagram size={13} color="#E4405F" /> : g.network === 'FACEBOOK' ? <SiFacebook size={13} color="#1877F2" /> : null)}
                {g.scope === 'WEBSITE' && <Globe size={13} className="text-zinc-500" />}
                <Link href={compact ? '/app/goals' : goalHref(g)} className="truncate hover:underline">
                  {label}
                </Link>
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {g.atMost ? 'At most' : 'At least'} {fmt(g.target)} · {WINDOWS.find((w) => w.days === g.windowDays)?.label.toLowerCase()}
                {!g.active && ' · paused'}
              </p>
            </div>
            <div className="w-40 shrink-0">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold tabular-nums">{g.actual === null ? '—' : fmt(g.actual)}</span>
                <span className="text-xs text-zinc-400">of {fmt(g.target)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-label={`${label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
            <div className="w-28 shrink-0">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.pill}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /> {g.active ? s.label : 'Paused'}
              </span>
              {g.checkedAt && (
                <p className="mt-1 text-[11px] text-zinc-400">
                  checked <LocalTime iso={g.checkedAt.toISOString()} options={{ hour: '2-digit', minute: '2-digit' }} />
                </p>
              )}
            </div>
            {canEdit && !compact && <GoalRowActions id={g.id} active={g.active} label={label} />}
          </li>
        )
      })}
    </ul>
  )
}
