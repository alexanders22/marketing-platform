import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { ArrowLeft, CalendarDays, Flag, Megaphone, Stethoscope, Target, Users } from 'lucide-react'
import { SiFacebook, SiInstagram } from 'react-icons/si'
import { requireContext } from '@/lib/context'
import { formatMoney, formatNumber } from '@/lib/format'
import { WINDOWS, formatMetric, metricDef } from '@/lib/goal-metrics'
import { prisma } from '@/lib/prisma'
import { OBJECTIVES, type PlanData } from '@/lib/strategist'
import { ApplyButton, ArchiveButton, CopyText, LaunchedToggle } from './PlanActions'

export const metadata: Metadata = { title: 'Plan — Loudpilot' }

function Block({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          {icon}
          {title}
        </h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}

const r = (pair: [number, number] | null, fmt: (v: number) => string) => (pair ? `${fmt(pair[0])} – ${fmt(pair[1])}` : '—')

export default async function PlanPage({ params }: PageProps<'/app/strategy/[id]'>) {
  const { workspace, role } = await requireContext()
  const { id } = await params
  const plan = await prisma.strategyPlan.findFirst({ where: { id, workspaceId: workspace.id } })
  if (!plan) notFound()
  const d = plan.data as unknown as PlanData
  const canEdit = role !== 'EDITOR' && plan.status !== 'ARCHIVED'
  const money = (v: number) => formatMoney(v, plan.currency)
  const audienceName = (aid: string) => d.audiences.find((a) => a.id === aid)?.name ?? '—'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/app/strategy" className="grid h-10 w-10 place-items-center rounded-lg bg-zinc-100 hover:bg-zinc-200" aria-label="Back to plans">
          <ArrowLeft size={18} />
        </Link>
        <div className="mr-auto min-w-0 max-w-3xl flex-1">
          <p className="text-xs font-medium text-indigo-600">
            {OBJECTIVES.find((o) => o.id === plan.objective)?.label} · {plan.startsOn} – {plan.endsOn}
            {plan.budget ? ` · ${money(plan.budget)} ad budget` : ' · no ad budget'}
            {plan.status === 'ARCHIVED' && ' · archived'}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">{d.headline}</h1>
          <p className="mt-2 text-sm text-zinc-500">“{plan.goal}”</p>
        </div>
        {canEdit && <ArchiveButton planId={plan.id} />}
      </div>

      <Block title="Diagnosis and strategy" icon={<Stethoscope size={17} className="text-zinc-500" />}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
          {d.diagnosis.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="mt-4 text-[15px] text-zinc-800">{d.strategy}</p>
      </Block>

      <div className="grid gap-6 lg:grid-cols-2">
        <Block title="Audiences" icon={<Users size={17} className="text-zinc-500" />}>
          <ul className="space-y-3">
            {d.audiences.map((a) => (
              <li key={a.id} className="rounded-xl bg-zinc-50 p-3 text-sm">
                <p className="font-medium">{a.name}</p>
                <p className="text-zinc-600">{a.who}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {[a.targeting.ages && `Age ${a.targeting.ages}`, a.targeting.genders, a.targeting.locations.join(', '), a.targeting.interests.join(', ')].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-1 text-xs text-indigo-700">Message: {a.message}</p>
              </li>
            ))}
          </ul>
        </Block>
        <Block title="Budget" icon={<Target size={17} className="text-zinc-500" />}>
          <ul className="space-y-2.5">
            {d.budgetSplit.map((b) => (
              <li key={b.label} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{b.label}</span>
                  <span className="tabular-nums text-zinc-600">
                    {Math.round(b.share * 100)}%{plan.budget ? ` · ${money(plan.budget * b.share)}` : ''}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.round(b.share * 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-zinc-500">{b.why}</p>
              </li>
            ))}
          </ul>
          {d.pillars.length > 0 && (
            <>
              <p className="mt-5 mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Content pillars</p>
              <ul className="space-y-1 text-sm">
                {d.pillars.map((p) => (
                  <li key={p.name}>
                    <b className="font-medium">{p.name}</b> <span className="text-zinc-400">· {Math.round(p.share * 100)}%</span>
                    <span className="block text-xs text-zinc-500">{p.why}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Block>
      </div>

      {d.ads.length > 0 && (
        <Block title="Ad campaigns" icon={<Megaphone size={17} className="text-zinc-500" />}>
          <p className="mb-4 text-xs text-zinc-500">{d.forecastNote} Launching from Loudpilot comes with Meta’s approval; until then copy the setup into Ads Manager.</p>
          <div className="space-y-4">
            {d.ads.map((c) => {
              const setup = [
                `Campaign: ${c.name}`,
                `Objective: ${c.objective}`,
                c.dailyBudget ? `Daily budget: ${money(c.dailyBudget)} for ${c.days} days (${money(c.budget ?? 0)})` : `Duration: ${c.days} days`,
                `Audience: ${audienceName(c.audienceId)} — ${(() => {
                  const a = d.audiences.find((x) => x.id === c.audienceId)
                  return a ? [a.targeting.ages, a.targeting.genders, a.targeting.locations.join(', '), a.targeting.interests.join(', ')].filter(Boolean).join('; ') : ''
                })()}`,
                ...c.creatives.map((k, i) => `\nAd ${i + 1}\nHeadline: ${k.headline}\nText: ${k.primaryText}\nButton: ${k.cta}\nVisual: ${k.visual}`),
              ].join('\n')
              return (
                <div key={c.id} className="rounded-xl border border-zinc-200 p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="mr-auto min-w-0">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-zinc-500">
                        {c.objective.toLowerCase()} · {audienceName(c.audienceId)} · {c.days} days
                        {c.dailyBudget ? ` · ${money(c.dailyBudget)}/day · ${money(c.budget ?? 0)} total` : ''}
                      </p>
                    </div>
                    <CopyText text={setup} />
                    {canEdit && <LaunchedToggle planId={plan.id} adId={c.id} launched={Boolean(c.launched)} />}
                  </div>
                  {c.forecast && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      {[
                        ['Reach, up to', formatNumber(c.forecast.reach[1])],
                        ['Clicks', r(c.forecast.clicks, formatNumber)],
                        [c.forecast.resultLabel, r(c.forecast.results, formatNumber)],
                        ['Cost per result', r(c.forecast.costPerResult, money)],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-indigo-50/60 p-2.5">
                          <p className="text-xs text-indigo-700">{k}</p>
                          <p className="font-semibold tabular-nums">{v}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 text-xs text-zinc-500">{c.why}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {c.creatives.map((k, i) => (
                      <div key={i} className="rounded-lg bg-zinc-50 p-3 text-sm">
                        <p className="font-medium">{k.headline}</p>
                        <p className="mt-1 line-clamp-4 text-zinc-600">{k.primaryText}</p>
                        <p className="mt-2 text-xs text-zinc-500">
                          {k.cta} · {k.visual}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Block>
      )}

      {d.posts.length > 0 && (
        <Block
          title="Posts for the first two weeks"
          icon={<CalendarDays size={17} className="text-zinc-500" />}
          action={canEdit && <ApplyButton planId={plan.id} kind="posts" count={d.posts.length} done={d.posts.filter((p) => p.postId).length} />}
        >
          <ul className="divide-y divide-zinc-100">
            {d.posts.map((p) => (
              <li key={p.id} className="flex gap-3 py-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-zinc-500">
                  {p.date}
                  <br />
                  {p.time}
                </span>
                <span className="mt-0.5 shrink-0">{p.network === 'FACEBOOK' ? <SiFacebook size={14} color="#1877F2" /> : <SiInstagram size={14} color="#E4405F" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-500">
                    {p.format} · {p.pillar}
                    {p.postId && (
                      <Link href={`/app/posts/${p.postId}`} className="ml-2 font-medium text-indigo-600">
                        In Planner →
                      </Link>
                    )}
                  </p>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-zinc-800">{p.caption}</p>
                  <p className="mt-1 text-xs text-sky-700">{p.hashtags.map((h) => `#${h}`).join(' ')}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Visual: {p.visual} · <i>{p.why}</i>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {d.goals.length > 0 && (
        <Block
          title="Goals Loudpilot will watch"
          icon={<Flag size={17} className="text-zinc-500" />}
          action={canEdit && <ApplyButton planId={plan.id} kind="goals" count={d.goals.length} done={d.goals.filter((g) => g.goalId).length} />}
        >
          <ul className="space-y-2 text-sm">
            {d.goals.map((g) => {
              const def = metricDef(g.metric)
              if (!def) return null
              const target = def.kind === 'percent' ? g.target / 100 : g.target
              return (
                <li key={g.id} className="flex flex-wrap items-baseline gap-x-2">
                  <b className="font-medium">
                    {def.label} {def.atMost ? 'at most' : 'at least'} {formatMetric(target, def.kind, plan.currency)}
                  </b>
                  <span className="text-zinc-500">
                    · {g.scope === 'ADS' ? 'all ads' : g.network ? `${g.network.toLowerCase()} posts` : 'posts'} ·{' '}
                    {WINDOWS.find((w) => w.days === g.windowDays)?.label.toLowerCase()}
                  </span>
                  {g.goalId && <span className="text-xs font-medium text-emerald-700">watching</span>}
                  <span className="basis-full text-xs text-zinc-500">{g.why}</span>
                </li>
              )
            })}
          </ul>
        </Block>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {d.weekly && (
          <Block title="Every week" icon={<CalendarDays size={17} className="text-zinc-500" />}>
            <p className="text-sm text-zinc-700">{d.weekly}</p>
          </Block>
        )}
        {d.risks.length > 0 && (
          <Block title="Risks" icon={<Target size={17} className="text-zinc-500" />}>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {d.risks.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </Block>
        )}
      </div>
    </div>
  )
}
