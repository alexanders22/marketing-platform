import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CalendarPlus, CheckCircle2, Eye, Flag, Megaphone, PauseCircle, PenLine, Repeat2, Sparkles, Target, TriangleAlert, Wallet, Wand2 } from 'lucide-react'
import { CompareBars, DeltaPill, Ring, StatTile } from '@/components/viz'
import { SiFacebook, SiInstagram } from 'react-icons/si'
import type { ReviewRec } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { formatMoney, formatNumber } from '@/lib/format'
import { WINDOWS, formatMetric, metricDef } from '@/lib/goal-metrics'
import { prisma } from '@/lib/prisma'
import type { ReviewData, WeekFacts } from '@/lib/weekly'
import { RecActions, ReviewNowButton } from './RecActions'

export const metadata: Metadata = { title: 'Weekly review — Loudpilot' }

const KIND: Record<string, { label: string; icon: ReactNode; chip: string; edge: string }> = {
  post: { label: 'Post', icon: <CalendarPlus size={17} />, chip: 'bg-violet-100 text-violet-700', edge: 'bg-violet-500' },
  repeat: { label: 'Repeat a winner', icon: <Repeat2 size={17} />, chip: 'bg-pink-100 text-pink-700', edge: 'bg-pink-500' },
  goal: { label: 'Goal', icon: <Flag size={17} />, chip: 'bg-emerald-100 text-emerald-700', edge: 'bg-emerald-500' },
  budget: { label: 'Budget', icon: <Wallet size={17} />, chip: 'bg-amber-100 text-amber-700', edge: 'bg-amber-400' },
  creative: { label: 'New creative', icon: <Wand2 size={17} />, chip: 'bg-fuchsia-100 text-fuchsia-700', edge: 'bg-fuchsia-500' },
  pause: { label: 'Stop spending', icon: <PauseCircle size={17} />, chip: 'bg-red-100 text-red-700', edge: 'bg-red-500' },
  other: { label: 'Action', icon: <Sparkles size={17} />, chip: 'bg-zinc-100 text-zinc-700', edge: 'bg-zinc-400' },
}
const IMPACT: Record<string, string> = {
  high: 'bg-gradient-to-r from-[#ff2e6e] to-[#ff5b14] text-white',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-zinc-100 text-zinc-600',
}
const card = 'rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,16,32,0.04)]'


function Details({ kind, p, currency }: { kind: string; p: Omit<ReviewRec, 'kind' | 'title' | 'why' | 'impact'>; currency: string | null }) {
  if ((kind === 'post' || kind === 'repeat') && p.post) {
    return (
      <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm">
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          {p.post.network === 'FACEBOOK' ? <SiFacebook size={12} color="#1877F2" /> : <SiInstagram size={12} color="#E4405F" />}
          {p.post.date} · {p.post.time} · {p.post.format}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-zinc-800">{p.post.caption}</p>
        {p.post.hashtags.length > 0 && <p className="mt-1 text-xs text-sky-700">{p.post.hashtags.map((h) => `#${h}`).join(' ')}</p>}
        {p.post.visual && <p className="mt-1 text-xs text-zinc-500">Visual: {p.post.visual}</p>}
      </div>
    )
  }
  if (kind === 'goal' && p.goal) {
    const def = metricDef(p.goal.metric)
    if (!def) return null
    const target = def.kind === 'percent' ? p.goal.target / 100 : p.goal.target
    return (
      <p className="mt-2 text-sm text-zinc-700">
        {def.label} {def.atMost ? 'at most' : 'at least'} <b>{formatMetric(target, def.kind, currency)}</b> ·{' '}
        {p.goal.scope === 'ADS' ? 'all ads' : p.goal.network ? `${p.goal.network.toLowerCase()} posts` : 'posts'} ·{' '}
        {WINDOWS.find((w) => w.days === p.goal!.windowDays)?.label.toLowerCase()}
      </p>
    )
  }
  return (
    <div className="mt-2 space-y-2 text-sm">
      {p.campaign && (
        <p className="text-zinc-600">
          Campaign: <b className="font-medium text-zinc-800">{p.campaign}</b>
          {p.amountPerDay ? ` · ${formatMoney(p.amountPerDay, currency)}/day` : ''}
        </p>
      )}
      {p.creative && (
        <div className="rounded-xl bg-zinc-50 p-3">
          <p className="font-medium">{p.creative.headline}</p>
          <p className="text-zinc-700">{p.creative.primaryText}</p>
          {p.creative.visual && <p className="mt-1 text-xs text-zinc-500">Visual: {p.creative.visual}</p>}
        </div>
      )}
      {p.steps && p.steps.length > 0 && (
        <ol className="list-decimal space-y-0.5 pl-5 text-zinc-700">
          {p.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default async function WeeklyPage() {
  const { workspace, role } = await requireContext()
  const reviews = await prisma.weeklyReview.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: { recommendations: { orderBy: { createdAt: 'asc' } } },
  })
  const latest = reviews[0]
  const canEdit = role !== 'EDITOR'
  const data = latest?.data as ReviewData | undefined
  const facts = latest?.stats as WeekFacts | undefined
  const open = latest?.recommendations.filter((r) => r.status === 'OPEN') ?? []
  const handled = latest?.recommendations.filter((r) => r.status !== 'OPEN') ?? []
  const ORDER = { high: 0, medium: 1, low: 2 } as Record<string, number>

  const adsCur = facts?.ads.reduce((s, c) => ({ spend: s.spend + (c.thisWeek.spend ?? 0), results: s.results + c.thisWeek.results }), { spend: 0, results: 0 })
  const adsPrev = facts?.ads.reduce((s, c) => ({ spend: s.spend + (c.weekBefore.spend ?? 0), results: s.results + c.weekBefore.results }), { spend: 0, results: 0 })

  const total = latest?.recommendations.length ?? 0
  const done = latest?.recommendations.filter((r) => r.status === 'APPLIED').length ?? 0
  const tiles = facts
    ? [
        { label: 'Ad spend', icon: <Wallet size={15} />, tint: 'bg-violet-50 text-violet-600', now: adsCur?.spend ?? 0, before: adsPrev?.spend ?? 0, value: formatMoney(adsCur?.spend ?? 0, facts.currency, 0), unit: { kind: 'money' as const, currency: facts.currency }, neutral: true },
        { label: 'Ad results', icon: <Target size={15} />, tint: 'bg-orange-50 text-orange-600', now: adsCur?.results ?? 0, before: adsPrev?.results ?? 0, value: formatNumber(adsCur?.results ?? 0) },
        { label: 'Posts', icon: <PenLine size={15} />, tint: 'bg-pink-50 text-pink-600', now: facts.organic.thisWeek.posts, before: facts.organic.weekBefore.posts, value: String(facts.organic.thisWeek.posts) },
        { label: 'Post reach', icon: <Eye size={15} />, tint: 'bg-sky-50 text-sky-600', now: facts.organic.thisWeek.reach, before: facts.organic.weekBefore.reach, value: formatNumber(facts.organic.thisWeek.reach) },
      ]
    : []

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Weekly review</h1>
          <p className="text-sm text-zinc-500">
            Every Monday Loudpilot reviews the last week like your agency would: what worked, what did not, and what to do next. Apply what you
            like — posts land in the Planner, goals start being watched.
          </p>
        </div>
        {canEdit && <ReviewNowButton first={!latest} />}
      </div>

      {!latest || !data || !facts ? (
        <section className="rounded-3xl border border-dashed border-violet-200 bg-violet-50/40 p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white">
            <Sparkles size={22} />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Your first review arrives on Monday</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            It reads your ads, posts, goals and alerts of the week, compares them with the week before and suggests the next steps.
          </p>
        </section>
      ) : (
        <>
          <section aria-label="This week" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1b1145] via-[#3b1a8f] to-[#7b3ff2] p-6 text-white shadow-[0_24px_60px_-30px_rgba(76,29,149,0.9)]">
            <div className="pointer-events-none absolute -top-24 right-24 h-64 w-64 rounded-full bg-fuchsia-400/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 -left-10 h-56 w-56 rounded-full bg-orange-400/20 blur-3xl" />
            <div className="relative grid gap-6 lg:grid-cols-[1fr_auto]">
              <div>
                <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-violet-100 ring-1 ring-white/15">
                  {latest.weekStart} – {latest.weekEnd}
                </span>
                <h2 className="mt-3 text-2xl leading-tight font-bold tracking-tight text-balance">{data.headline}</h2>
                <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-white/85">{data.summary}</p>
              </div>
              {total > 0 && (
                <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm lg:flex-col lg:justify-center lg:text-center">
                  <Ring value={done / total} size={96} stroke={10} color="#fbbf24" track="rgba(255,255,255,0.18)" label="Recommendations done this week">
                    <span className="text-xl font-bold tabular-nums">
                      {done}/{total}
                    </span>
                  </Ring>
                  <div>
                    <p className="text-sm font-semibold">This week&apos;s plan</p>
                    <p className="text-xs text-white/75">+20 XP for each one you apply</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section aria-label="Week in numbers" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {tiles.map((t) => (
              <StatTile
                key={t.label}
                label={t.label}
                value={t.value}
                icon={t.icon}
                tint={t.tint}
                delta={<DeltaPill cur={t.now} prev={t.before} neutral={t.neutral} label="vs the week before" />}
                spark={<CompareBars now={t.now} before={t.before} unit={t.unit} label={t.label} />}
              />
            ))}
          </section>

          {(data.wins.length > 0 || data.issues.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              {data.wins.length > 0 && (
                <section aria-label="Went well" className="rounded-2xl bg-gradient-to-br from-emerald-50 to-white p-5 ring-1 ring-emerald-100">
                  <p className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-800">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500 text-white">
                      <CheckCircle2 size={15} />
                    </span>
                    Went well
                  </p>
                  <ul className="space-y-2.5 text-sm">
                    {data.wins.map((w) => (
                      <li key={w.text} className="rounded-xl bg-white/80 p-3 ring-1 ring-emerald-100">
                        <span className="font-medium text-zinc-900">{w.text}</span>
                        <span className="mt-0.5 block text-xs text-zinc-500">{w.evidence}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {data.issues.length > 0 && (
                <section aria-label="Needs attention" className="rounded-2xl bg-gradient-to-br from-rose-50 to-white p-5 ring-1 ring-rose-100">
                  <p className="mb-3 flex items-center gap-2 text-sm font-bold text-rose-800">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-rose-500 text-white">
                      <TriangleAlert size={15} />
                    </span>
                    Needs attention
                  </p>
                  <ul className="space-y-2.5 text-sm">
                    {data.issues.map((w) => (
                      <li key={w.text} className="rounded-xl bg-white/80 p-3 ring-1 ring-rose-100">
                        <span className="font-medium text-zinc-900">{w.text}</span>
                        <span className="mt-0.5 block text-xs text-zinc-500">{w.evidence}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold tracking-tight">
                Recommendations {open.length > 0 && <span className="text-zinc-400">· {open.length} open</span>}
              </h2>
              {total > 0 && (
                <div className="flex min-w-48 flex-1 items-center gap-2 sm:max-w-xs" role="progressbar" aria-label="Recommendations done" aria-valuenow={Math.round((done / total) * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-violet-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#7b3ff2] to-[#ff2e6e] transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-zinc-600 tabular-nums">
                    {done} of {total} done
                  </span>
                </div>
              )}
            </div>
            {open.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-5 text-sm text-emerald-800">All handled for this week. 🎉</p>
            ) : (
              <ul className="space-y-3" aria-label="Open recommendations">
                {[...open]
                  .sort((a, b) => ORDER[a.impact] - ORDER[b.impact])
                  .map((r) => {
                    const k = KIND[r.kind] ?? KIND.other
                    return (
                      <li key={r.id} className={`${card} relative overflow-hidden p-5 pl-6`}>
                        <span className={`absolute inset-y-0 left-0 w-1.5 ${k.edge}`} />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`grid h-8 w-8 place-items-center rounded-xl ${k.chip}`}>{k.icon}</span>
                          <span className="text-xs font-semibold text-zinc-500">{k.label}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${IMPACT[r.impact] ?? IMPACT.low}`}>{r.impact} impact</span>
                        </div>
                        <h3 className="mt-2.5 text-base font-semibold text-zinc-900">{r.title}</h3>
                        <p className="mt-1 text-sm text-zinc-600">{r.why}</p>
                        <Details kind={r.kind} p={r.payload as Omit<ReviewRec, 'kind' | 'title' | 'why' | 'impact'>} currency={facts.currency} />
                        {canEdit && (
                          <div className="mt-4">
                            <RecActions id={r.id} kind={r.kind} />
                          </div>
                        )}
                      </li>
                    )
                  })}
              </ul>
            )}
            {handled.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {handled.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-zinc-500">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.status === 'APPLIED' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}
                    >
                      {r.status === 'APPLIED' ? '✓ done' : r.status === 'DISMISSED' ? 'skipped' : 'expired'}
                    </span>
                    <span className="truncate">{r.title}</span>
                    {r.appliedRef && (r.kind === 'post' || r.kind === 'repeat') && (
                      <Link href={`/app/posts/${r.appliedRef}`} className="shrink-0 font-medium text-violet-700">
                        draft →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {facts.ads.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-50 text-violet-600">
                  <Megaphone size={16} />
                </span>
                Campaigns this week
              </h2>
              <div className={`${card} overflow-x-auto`}>
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="text-left text-xs text-zinc-500">
                    <tr className="border-b border-zinc-100">
                      <th className="px-4 py-3 font-medium">Campaign</th>
                      <th className="px-3 py-3 text-right font-medium">Spend</th>
                      <th className="px-3 py-3 text-right font-medium">Results</th>
                      <th className="px-3 py-3 text-right font-medium">Cost / result</th>
                      <th className="px-4 py-3 text-right font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 tabular-nums">
                    {facts.ads.map((c) => (
                      <tr key={c.name} className="hover:bg-violet-50/40">
                        <td className="px-4 py-3">
                          <span className="font-medium">{c.name}</span>
                          <span className="ml-2 text-xs text-zinc-400">{c.status.toLowerCase().replace(/_/g, ' ')}</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatMoney(c.thisWeek.spend ?? 0, facts.currency)} <DeltaPill cur={c.thisWeek.spend} prev={c.weekBefore.spend} neutral />
                        </td>
                        <td className="px-3 py-3 text-right">
                          {c.thisWeek.results} <span className="text-xs text-zinc-400">{c.resultLabel.toLowerCase()}</span> <DeltaPill cur={c.thisWeek.results} prev={c.weekBefore.results} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          {c.thisWeek.costPerResult === null ? '—' : formatMoney(c.thisWeek.costPerResult, facts.currency)}{' '}
                          <DeltaPill cur={c.thisWeek.costPerResult} prev={c.weekBefore.costPerResult} lowerIsBetter />
                        </td>
                        <td className="px-4 py-3 text-right">{c.thisWeek.ctr === null ? '—' : `${(c.thisWeek.ctr * 100).toFixed(2)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {reviews.length > 1 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">Earlier reviews</h2>
              <ol className="relative space-y-3 border-l-2 border-violet-100 pl-6">
                {reviews.slice(1).map((r) => {
                  const d = r.data as ReviewData
                  const applied = r.recommendations.filter((x) => x.status === 'APPLIED').length
                  const all = r.recommendations.length
                  return (
                    <li key={r.id} className="relative">
                      <span className="absolute top-4 -left-[31px] h-3 w-3 rounded-full bg-violet-500 ring-4 ring-white" />
                      <details className={`${card} p-4`}>
                        <summary className="cursor-pointer text-sm">
                          <span className="text-xs font-semibold text-violet-700">
                            {r.weekStart} – {r.weekEnd}
                          </span>
                          <span className="mt-0.5 block font-medium text-zinc-900">{d.headline}</span>
                          <span className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">
                            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100">
                              <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${all ? (applied / all) * 100 : 0}%` }} />
                            </span>
                            {applied}/{all} applied
                          </span>
                        </summary>
                        <p className="mt-2 text-sm text-zinc-600">{d.summary}</p>
                      </details>
                    </li>
                  )
                })}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  )
}
