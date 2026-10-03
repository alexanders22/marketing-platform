import type { Metadata } from 'next'
import Link from 'next/link'
import { Flag } from 'lucide-react'
import { SiFacebook, SiInstagram } from 'react-icons/si'
import { LocalTime } from '@/components/LocalTime'
import { requireContext } from '@/lib/context'
import { WINDOWS, formatMetric, metricDef } from '@/lib/goal-metrics'
import { goalHref } from '@/lib/goals'
import { prisma } from '@/lib/prisma'
import { GoalForm } from './GoalForm'
import { GoalRowActions } from './GoalRowActions'

export const metadata: Metadata = { title: 'Goals — Loudpilot' }

const STATUS = {
  ON_TRACK: { label: 'On track', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  AT_RISK: { label: 'At risk', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  OFF_TRACK: { label: 'Off track', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700', bar: 'bg-red-500' },
  NO_DATA: { label: 'No data yet', dot: 'bg-zinc-300', pill: 'bg-zinc-100 text-zinc-600', bar: 'bg-zinc-300' },
} as const

export default async function GoalsPage() {
  const { workspace, role } = await requireContext()
  const [goals, campaigns, ads, posts] = await Promise.all([
    prisma.goal.findMany({
      where: { workspaceId: workspace.id },
      include: { adCampaign: { select: { name: true, currency: true } } },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.adCampaign.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, status: true, currency: true },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    }),
    prisma.socialAccount.count({ where: { workspaceId: workspace.id, network: 'META_ADS' } }),
    prisma.socialAccount.count({ where: { workspaceId: workspace.id, network: { in: ['FACEBOOK', 'INSTAGRAM'] } } }),
  ])
  const currency = campaigns.find((c) => c.currency)?.currency ?? null
  const canEdit = role !== 'EDITOR'
  const counts = { OFF_TRACK: 0, AT_RISK: 0, ON_TRACK: 0, NO_DATA: 0 }
  for (const g of goals.filter((g) => g.active)) counts[g.status]++

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
          <p className="text-sm text-zinc-500">Set the numbers that matter. Loudpilot checks them every hour and alerts you when they slip.</p>
        </div>
        {canEdit && (ads > 0 || posts > 0) && <GoalForm campaigns={campaigns} currency={currency} hasAds={ads > 0} hasPosts={posts > 0} />}
      </div>

      {ads === 0 && posts === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-zinc-100">
            <Flag size={22} />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Connect an ad account or a page first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            Goals watch real results — cost per lead, reach, views, likes and more.
          </p>
          <Link href="/app/channels" className="mt-5 inline-flex rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white">
            Connect channels
          </Link>
        </section>
      ) : goals.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 p-8 text-sm text-zinc-600">
          <p className="font-medium text-zinc-900">Ideas to start with</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Cost per lead at most ₾5 over the last 7 days</li>
            <li>At least 80 leads over the last 7 days for your main campaign</li>
            <li>Average reach per Instagram post at least 1,000</li>
            <li>Engagement rate at least 3% over the last 30 days</li>
            <li>At least 3 posts a week</li>
          </ul>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            {(['OFF_TRACK', 'AT_RISK', 'ON_TRACK', 'NO_DATA'] as const).map((k) => (
              <span key={k} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${STATUS[k].pill}`}>
                <span className={`h-2 w-2 rounded-full ${STATUS[k].dot}`} /> {counts[k]} {STATUS[k].label.toLowerCase()}
              </span>
            ))}
          </div>
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
            {goals.map((g) => {
              const def = metricDef(g.metric)
              if (!def) return null
              const cur = g.adCampaign?.currency ?? currency
              const fmt = (v: number) => formatMetric(v, def.kind, cur)
              const s = STATUS[g.active ? g.status : 'NO_DATA']
              const name =
                g.scope === 'CAMPAIGN'
                  ? (g.adCampaign?.name ?? 'Campaign')
                  : g.scope === 'ADS'
                    ? 'All ads'
                    : g.network === 'INSTAGRAM'
                      ? 'Instagram posts'
                      : g.network === 'FACEBOOK'
                        ? 'Facebook posts'
                        : 'Facebook and Instagram posts'
              const progress =
                g.actual === null || !g.active
                  ? 0
                  : g.atMost
                    ? Math.min(1, g.target / Math.max(g.actual, 1e-9))
                    : Math.min(1, g.actual / g.target)
              const label = `${def.label} — ${name}`
              return (
                <li key={g.id} className={`flex flex-wrap items-center gap-4 p-4 ${g.active ? '' : 'opacity-60'}`}>
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {g.scope === 'POSTS' && (g.network === 'INSTAGRAM' ? <SiInstagram size={13} color="#E4405F" /> : g.network === 'FACEBOOK' ? <SiFacebook size={13} color="#1877F2" /> : null)}
                      <Link href={goalHref(g)} className="truncate hover:underline">
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
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
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
                  {canEdit && <GoalRowActions id={g.id} active={g.active} label={label} />}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
