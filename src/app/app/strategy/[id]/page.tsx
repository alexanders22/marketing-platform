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
import { ApplyButton, ArchiveButton, CopyText, LaunchPlan, LaunchedToggle, LinkCampaign, PlanVisuals } from './PlanActions'
import { isVideoFormat as isVideo, postsWithoutVisuals, visualsCost, visualsRunning } from '@/lib/plan-visuals'
import { ComparisonCard } from '../../results/Comparison'
import { planActuals } from '@/lib/actuals'
import { holidaysBetween, type Holiday } from '@/lib/holidays'
import { prices } from '@/lib/credits'
import { Clapperboard, PartyPopper } from 'lucide-react'

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
  const COST = await prices()
  const adCampaigns = await prisma.adCampaign.findMany({ where: { workspaceId: workspace.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  // Once something of the plan is live, compare it with what happened.
  const started = d.posts.some((p) => p.postId) || d.goals.some((g) => g.goalId) || d.ads.some((a) => a.launched)
  const comparison = started ? await planActuals(plan) : null
  const audienceName = (aid: string) => d.audiences.find((a) => a.id === aid)?.name ?? '—'
  // Pictures and videos: what the posts not yet in the Planner would need, and
  // the ones in the Planner still without any.
  const toApply = d.posts.filter((p) => !p.postId)
  const need = { posts: toApply.length, ...visualsCost(toApply, COST) }
  const bare = await postsWithoutVisuals(plan.id)
  const making = visualsRunning(d.visuals)

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
        {canEdit && <LaunchPlan planId={plan.id} left={toApply.length + d.goals.filter((g) => !g.goalId).length} visuals={need} />}
        {canEdit && <ArchiveButton planId={plan.id} />}
      </div>

      {comparison && <ComparisonCard kind="plan" id={plan.id} data={comparison} />}

      <MediaPlan d={d} money={money} holidays={holidaysBetween(plan.startsOn, plan.endsOn)} cost={visualsCost(d.posts, COST)} />

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
                    {canEdit && <LinkCampaign planId={plan.id} adId={c.id} value={c.adCampaignId ?? null} campaigns={adCampaigns} />}
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
          action={canEdit && <ApplyButton planId={plan.id} kind="posts" count={d.posts.length} done={d.posts.filter((p) => p.postId).length} visuals={need} />}
        >
          <PlanVisuals
            planId={plan.id}
            running={making}
            total={d.visuals?.total ?? 0}
            left={bare.length}
            credits={visualsCost(bare, COST).credits}
            outOfCredits={d.visuals?.outOfCredits ?? false}
            canEdit={canEdit}
          />
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
                    {isVideo(p.format) && (
                      <Link href={`/app/studio?tab=video&ai=${encodeURIComponent(`${p.caption.slice(0, 400)}\n\nVisual: ${p.visual}`)}`} className="ml-2 font-medium text-fuchsia-700">
                        Make the video →
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

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
      {sub && <p className="truncate text-xs text-zinc-500">{sub}</p>}
    </div>
  )
}

// What, how many, where, when and how much — the plan at a glance.
function MediaPlan({ d, money, holidays, cost }: { d: PlanData; money: (v: number) => string; holidays: Holiday[]; cost: { images: number; videos: number; credits: number } }) {
  const counts = new Map<string, number>()
  for (const p of d.posts) {
    const k = `${p.network === 'FACEBOOK' ? 'Facebook' : 'Instagram'} · ${p.format}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const videos = d.posts.filter((p) => isVideo(p.format)).length
  const slots = new Map<string, number>()
  for (const p of d.posts) {
    const day = new Date(`${p.date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
    slots.set(`${day} ${p.time}`, (slots.get(`${day} ${p.time}`) ?? 0) + 1)
  }
  const times = [...slots.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k)
  const adTotal = d.ads.reduce((s, a) => s + (a.budget ?? 0), 0)
  return (
    <section aria-label="Media plan" className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
      <h2 className="font-semibold">Your media plan at a glance</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Cell label="What" value={`${d.posts.length} posts`} sub={`${Math.round(d.posts.length / 2)} a week, ${videos} video${videos === 1 ? '' : 's'}`} />
        <Cell label="Where" value={[...new Set(d.posts.map((p) => (p.network === 'FACEBOOK' ? 'Facebook' : 'Instagram')))].join(' + ') || '—'} sub={d.ads.length ? `+ ${d.ads.length} ad campaign${d.ads.length === 1 ? '' : 's'}` : 'organic only'} />
        <Cell label="When" value={times[0] ?? '—'} sub={times.slice(1).join(' · ')} />
        <Cell label="Ad budget" value={adTotal ? money(adTotal) : '—'} sub={d.ads.map((a) => a.objective.toLowerCase()).join(', ')} />
        <Cell label="To make the visuals" value={`≈ ${cost.credits} credits`} sub={`${cost.images} images, ${cost.videos} videos`} />
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {[...counts.entries()].map(([k, n]) => (
          <li key={k} className="rounded-full bg-white px-2.5 py-1 ring-1 ring-zinc-200">
            {k} × {n}
          </li>
        ))}
        {d.goals.length > 0 && <li className="rounded-full bg-white px-2.5 py-1 ring-1 ring-zinc-200">{d.goals.length} goals to watch</li>}
      </ul>
      {holidays.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-rose-800">
          <PartyPopper size={13} /> In this period: {holidays.map((h) => `${h.name} (${h.date.slice(5)})`).join(', ')}
        </p>
      )}
      {videos > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-fuchsia-800">
          <Clapperboard size={13} /> Video posts have a “Make the video” link — Studio writes and voices them from the post.
        </p>
      )}
    </section>
  )
}
