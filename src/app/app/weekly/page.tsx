import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarPlus, CheckCircle2, Flag, Megaphone, PauseCircle, Repeat2, Sparkles, TriangleAlert, Wallet, Wand2 } from 'lucide-react'
import { SiFacebook, SiInstagram } from 'react-icons/si'
import type { ReviewRec } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { formatMoney, formatNumber } from '@/lib/format'
import { WINDOWS, formatMetric, metricDef } from '@/lib/goal-metrics'
import { prisma } from '@/lib/prisma'
import type { ReviewData, WeekFacts } from '@/lib/weekly'
import { RecActions, ReviewNowButton } from './RecActions'

export const metadata: Metadata = { title: 'Weekly review — Khma' }

const KIND: Record<string, { label: string; icon: ReactNode }> = {
  post: { label: 'Post', icon: <CalendarPlus size={16} className="text-indigo-600" /> },
  repeat: { label: 'Repeat a winner', icon: <Repeat2 size={16} className="text-indigo-600" /> },
  goal: { label: 'Goal', icon: <Flag size={16} className="text-emerald-600" /> },
  budget: { label: 'Budget', icon: <Wallet size={16} className="text-amber-600" /> },
  creative: { label: 'New creative', icon: <Wand2 size={16} className="text-fuchsia-600" /> },
  pause: { label: 'Stop spending', icon: <PauseCircle size={16} className="text-red-600" /> },
  other: { label: 'Action', icon: <Sparkles size={16} className="text-zinc-600" /> },
}
const IMPACT: Record<string, string> = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-zinc-100 text-zinc-600',
}

function Change({ cur, prev, lowerIsBetter = false }: { cur: number | null; prev: number | null; lowerIsBetter?: boolean }) {
  if (cur === null || prev === null || prev === 0) return null
  const c = (cur - prev) / prev
  if (Math.abs(c) < 0.005) return <span className="text-xs text-zinc-400">±0%</span>
  const good = lowerIsBetter ? c < 0 : c > 0
  const Icon = c > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center text-xs font-medium ${good ? 'text-emerald-600' : 'text-red-600'}`}>
      <Icon size={12} />
      {Math.abs(c * 100).toFixed(0)}%
    </span>
  )
}

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Weekly review</h1>
          <p className="text-sm text-zinc-500">
            Every Monday Khma reviews the last week like your agency would: what worked, what did not, and what to do next. Apply what you
            like — posts land in the Planner, goals start being watched.
          </p>
        </div>
        {canEdit && <ReviewNowButton first={!latest} />}
      </div>

      {!latest || !data || !facts ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
            <Sparkles size={22} />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Your first review arrives on Monday</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            It reads your ads, posts, goals and alerts of the week, compares them with the week before and suggests the next steps.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-indigo-50/50 to-white p-5">
            <p className="text-xs font-medium text-indigo-600">
              {latest.weekStart} – {latest.weekEnd}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-balance">{data.headline}</h2>
            <p className="mt-2 text-[15px] text-zinc-700">{data.summary}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Ad spend', adsCur ? formatMoney(adsCur.spend, facts.currency, 0) : '—', <Change key="s" cur={adsCur?.spend ?? null} prev={adsPrev?.spend ?? null} />],
                ['Ad results', adsCur ? formatNumber(adsCur.results) : '—', <Change key="r" cur={adsCur?.results ?? null} prev={adsPrev?.results ?? null} />],
                ['Posts', String(facts.organic.thisWeek.posts), <Change key="p" cur={facts.organic.thisWeek.posts} prev={facts.organic.weekBefore.posts} />],
                ['Post reach', formatNumber(facts.organic.thisWeek.reach), <Change key="o" cur={facts.organic.thisWeek.reach} prev={facts.organic.weekBefore.reach} />],
              ].map(([k, v, c]) => (
                <div key={k as string} className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
                  <p className="text-xs text-zinc-500">{k}</p>
                  <p className="text-lg font-semibold">{v}</p>
                  {c}
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {data.wins.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-emerald-700 uppercase">
                    <CheckCircle2 size={14} /> Went well
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {data.wins.map((w) => (
                      <li key={w.text}>
                        {w.text}
                        <span className="block text-xs text-zinc-500">{w.evidence}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.issues.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-red-700 uppercase">
                    <TriangleAlert size={14} /> Needs attention
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {data.issues.map((w) => (
                      <li key={w.text}>
                        {w.text}
                        <span className="block text-xs text-zinc-500">{w.evidence}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-semibold">
              Recommendations {open.length > 0 && <span className="text-zinc-400">· {open.length} open</span>}
            </h2>
            {open.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500">All handled for this week. 🎉</p>
            ) : (
              <ul className="space-y-3">
                {[...open]
                  .sort((a, b) => ORDER[a.impact] - ORDER[b.impact])
                  .map((r) => (
                    <li key={r.id} className="rounded-2xl border border-zinc-200 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {KIND[r.kind]?.icon}
                        <span className="text-xs font-medium text-zinc-500">{KIND[r.kind]?.label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${IMPACT[r.impact] ?? IMPACT.low}`}>{r.impact} impact</span>
                      </div>
                      <p className="mt-2 font-medium">{r.title}</p>
                      <p className="mt-1 text-sm text-zinc-600">{r.why}</p>
                      <Details kind={r.kind} p={r.payload as Omit<ReviewRec, 'kind' | 'title' | 'why' | 'impact'>} currency={facts.currency} />
                      {canEdit && (
                        <div className="mt-3">
                          <RecActions id={r.id} kind={r.kind} />
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            )}
            {handled.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-zinc-500">
                {handled.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs">{r.status === 'APPLIED' ? '✓ done' : r.status === 'DISMISSED' ? 'skipped' : 'expired'}</span>
                    <span className="truncate">{r.title}</span>
                    {r.appliedRef && (r.kind === 'post' || r.kind === 'repeat') && (
                      <Link href={`/app/posts/${r.appliedRef}`} className="shrink-0 text-indigo-600">
                        draft →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {facts.ads.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-semibold">
                <Megaphone size={16} className="text-zinc-500" /> Campaigns this week
              </h2>
              <div className="overflow-x-auto rounded-xl border border-zinc-200">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Campaign</th>
                      <th className="px-3 py-2 text-right font-medium">Spend</th>
                      <th className="px-3 py-2 text-right font-medium">Results</th>
                      <th className="px-3 py-2 text-right font-medium">Cost / result</th>
                      <th className="px-4 py-2 text-right font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 tabular-nums">
                    {facts.ads.map((c) => (
                      <tr key={c.name}>
                        <td className="px-4 py-2">
                          <span className="font-medium">{c.name}</span>
                          <span className="ml-2 text-xs text-zinc-400">{c.status.toLowerCase().replace(/_/g, ' ')}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatMoney(c.thisWeek.spend ?? 0, facts.currency)} <Change cur={c.thisWeek.spend} prev={c.weekBefore.spend} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {c.thisWeek.results} <span className="text-xs text-zinc-400">{c.resultLabel.toLowerCase()}</span> <Change cur={c.thisWeek.results} prev={c.weekBefore.results} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {c.thisWeek.costPerResult === null ? '—' : formatMoney(c.thisWeek.costPerResult, facts.currency)}{' '}
                          <Change cur={c.thisWeek.costPerResult} prev={c.weekBefore.costPerResult} lowerIsBetter />
                        </td>
                        <td className="px-4 py-2 text-right">{c.thisWeek.ctr === null ? '—' : `${(c.thisWeek.ctr * 100).toFixed(2)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {reviews.length > 1 && (
            <section>
              <h2 className="mb-2 font-semibold">Earlier reviews</h2>
              <ul className="space-y-2">
                {reviews.slice(1).map((r) => {
                  const d = r.data as ReviewData
                  const applied = r.recommendations.filter((x) => x.status === 'APPLIED').length
                  return (
                    <li key={r.id}>
                      <details className="rounded-xl border border-zinc-200 p-3">
                        <summary className="cursor-pointer text-sm">
                          <span className="text-zinc-500">
                            {r.weekStart} – {r.weekEnd}
                          </span>{' '}
                          · <b className="font-medium">{d.headline}</b>{' '}
                          <span className="text-xs text-zinc-400">
                            · {applied}/{r.recommendations.length} applied
                          </span>
                        </summary>
                        <p className="mt-2 text-sm text-zinc-600">{d.summary}</p>
                      </details>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
