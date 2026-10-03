import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, BarChart3, ExternalLink, Megaphone, Plug } from 'lucide-react'
import { SiFacebook, SiInstagram } from 'react-icons/si'
import { DailyChart, Sparkline } from '@/components/charts'
import { LocalTime } from '@/components/LocalTime'
import type { PerformanceSummary } from '@/lib/ai'
import { PERIODS, dashboard, type Period } from '@/lib/analytics'
import { requireContext } from '@/lib/context'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { SummaryCard } from './SummaryCard'
import { SyncButton } from './SyncButton'

export const metadata: Metadata = { title: 'Dashboard — Khma' }

const STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700' },
  PAUSED: { label: 'Paused', cls: 'bg-zinc-100 text-zinc-600' },
  CAMPAIGN_PAUSED: { label: 'Paused', cls: 'bg-zinc-100 text-zinc-600' },
  ADSET_PAUSED: { label: 'Paused', cls: 'bg-zinc-100 text-zinc-600' },
  IN_PROCESS: { label: 'Processing', cls: 'bg-sky-50 text-sky-700' },
  PENDING_REVIEW: { label: 'In review', cls: 'bg-sky-50 text-sky-700' },
  WITH_ISSUES: { label: 'Issues', cls: 'bg-amber-50 text-amber-700' },
  DISAPPROVED: { label: 'Rejected', cls: 'bg-red-50 text-red-700' },
  ARCHIVED: { label: 'Archived', cls: 'bg-zinc-100 text-zinc-500' },
  DELETED: { label: 'Deleted', cls: 'bg-zinc-100 text-zinc-500' },
}
const statusOf = (s: string) => STATUS[s] ?? { label: s.toLowerCase().replace(/_/g, ' '), cls: 'bg-zinc-100 text-zinc-600' }

function Delta({ cur, prev, lowerIsBetter = false }: { cur: number | null; prev: number | null; lowerIsBetter?: boolean }) {
  if (cur === null || prev === null || prev === 0) return <span className="text-xs text-zinc-400">—</span>
  const change = (cur - prev) / prev
  if (Math.abs(change) < 0.005) return <span className="text-xs text-zinc-400">no change</span>
  const good = lowerIsBetter ? change < 0 : change > 0
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good ? 'text-emerald-600' : 'text-red-600'}`}>
      <Icon size={13} />
      {Math.abs(change * 100).toFixed(change > -1 && change < 1 ? 1 : 0)}%
    </span>
  )
}

const GOAL = {
  ON_TRACK: { label: 'On track', cls: 'bg-emerald-500' },
  AT_RISK: { label: 'At risk', cls: 'bg-amber-500' },
  OFF_TRACK: { label: 'Off track', cls: 'bg-red-500' },
  NO_DATA: { label: 'No data', cls: 'bg-zinc-300' },
} as const

function GoalDot({ status }: { status: keyof typeof GOAL }) {
  return (
    <Link href="/app/goals" className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-zinc-600 hover:underline">
      <span className={`h-2 w-2 rounded-full ${GOAL[status].cls}`} /> {GOAL[status].label}
    </Link>
  )
}

function Kpi({ label, value, delta }: { label: string; value: string; delta: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200 p-4">
      <p className="truncate text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
      <div className="mt-1">{delta}</div>
    </div>
  )
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null)

export default async function DashboardPage({ searchParams }: PageProps<'/app/dashboard'>) {
  const { workspace } = await requireContext()
  const q = await searchParams
  const period = (PERIODS.find((p) => String(p) === q.days) ?? 30) as Period
  const d = await dashboard(workspace.id, period)
  const last = await prisma.aiSummary.findFirst({ where: { workspaceId: workspace.id, periodDays: period }, orderBy: { createdAt: 'desc' } })
  const summary = last ? (JSON.parse(last.text) as PerformanceSummary) : null
  const [goals, openAlerts, openRecs] = await Promise.all([
    prisma.goal.findMany({ where: { workspaceId: workspace.id, active: true, adCampaignId: { not: null } }, select: { adCampaignId: true, status: true } }),
    prisma.alert.count({ where: { workspaceId: workspace.id, readAt: null, severity: { in: ['CRITICAL', 'WARNING'] } } }),
    prisma.recommendation.count({ where: { workspaceId: workspace.id, status: 'OPEN' } }),
  ])
  // Worst goal status per campaign.
  const RANK = { OFF_TRACK: 3, AT_RISK: 2, ON_TRACK: 1, NO_DATA: 0 } as const
  const goalOf = new Map<string, keyof typeof RANK>()
  for (const g of goals) {
    const prevStatus = goalOf.get(g.adCampaignId!)
    if (!prevStatus || RANK[g.status] > RANK[prevStatus]) goalOf.set(g.adCampaignId!, g.status)
  }

  const c = d.current
  const p = d.previous
  const money = (v: number) => formatMoney(v, d.currency, v >= 100 ? 0 : 2)
  const cpr = ratio(d.resultSpend.current, c.results)
  const prevCpr = ratio(d.resultSpend.previous, p.results)
  const er = ratio(c.engagements, c.organicReach)
  const prevEr = ratio(p.engagements, p.organicReach)
  const nothing = d.connected.ads === 0 && d.connected.organic === 0 && c.posts === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-500">
            {d.from} – {d.to} · ads and posts in one place
          </p>
        </div>
        <nav className="flex rounded-lg bg-zinc-100 p-1 text-sm" aria-label="Period">
          {PERIODS.map((n) => (
            <Link
              key={n}
              href={`/app/dashboard?days=${n}`}
              aria-current={n === period ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 font-medium ${n === period ? 'bg-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
            >
              {n} days
            </Link>
          ))}
        </nav>
        {d.connected.ads > 0 && <SyncButton />}
      </div>

      {nothing ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-zinc-100">
            <BarChart3 size={22} />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Connect your accounts to see results</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            Connect a Meta ad account to follow spend, leads and cost per result, and your Facebook Page or Instagram to measure posts.
          </p>
          <Link href="/app/channels" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white">
            <Plug size={15} /> Connect channels
          </Link>
        </section>
      ) : (
        <>
          {openAlerts > 0 && (
            <Link href="/app/alerts" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 hover:bg-red-100">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {openAlerts} alert{openAlerts === 1 ? '' : 's'} need{openAlerts === 1 ? 's' : ''} your attention
              <span className="ml-auto font-medium">View →</span>
            </Link>
          )}
          {openRecs > 0 && (
            <Link href="/app/weekly" className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 hover:bg-indigo-100">
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
              {openRecs} recommendation{openRecs === 1 ? '' : 's'} from this week&apos;s review
              <span className="ml-auto font-medium">Review →</span>
            </Link>
          )}
          <SummaryCard period={period} initial={summary} createdAt={last?.createdAt.toISOString() ?? null} />

          {d.adAccounts.some((a) => a.status !== 'ACTIVE' || a.lastError) && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {d.adAccounts
                .filter((a) => a.status !== 'ACTIVE' || a.lastError)
                .map((a) => `${a.name}: ${a.status !== 'ACTIVE' ? 'needs reconnecting' : a.lastError}`)
                .join(' · ')}{' '}
              <Link href="/app/channels" className="font-medium underline">
                Open Channels
              </Link>
            </p>
          )}

          {/* Paid */}
          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Megaphone size={16} className="text-zinc-500" />
              <h2 className="font-semibold">Ads</h2>
              {d.adAccounts.length > 0 && (
                <span className="text-xs text-zinc-500">
                  {d.adAccounts.map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && ' · '}
                      {a.name}
                      {a.syncedAt && (
                        <>
                          {' '}
                          — updated <LocalTime iso={a.syncedAt.toISOString()} options={{ hour: '2-digit', minute: '2-digit' }} />
                        </>
                      )}
                    </span>
                  ))}
                  {d.mixedCurrencies && ' · totals mix currencies'}
                </span>
              )}
            </div>
            {d.connected.ads === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500">
                No ad account connected.{' '}
                <Link href="/app/channels" className="font-medium text-zinc-900 underline">
                  Connect Meta Ads
                </Link>{' '}
                to follow spend, {d.resultLabel.toLowerCase()} and cost per result here.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                  <Kpi label="Spend" value={money(c.spend)} delta={<Delta cur={c.spend} prev={p.spend} />} />
                  <Kpi label={d.resultLabel} value={formatNumber(c.results)} delta={<Delta cur={c.results} prev={p.results} />} />
                  <Kpi
                    label={`Cost per ${d.resultLabel === 'Results' ? 'result' : d.resultLabel.toLowerCase().replace(/s$/, '')}`}
                    value={cpr === null ? '—' : formatMoney(cpr, d.currency)}
                    delta={<Delta cur={cpr} prev={prevCpr} lowerIsBetter />}
                  />
                  <Kpi
                    label="CTR"
                    value={formatPercent(ratio(c.clicks, c.impressions))}
                    delta={<Delta cur={ratio(c.clicks, c.impressions)} prev={ratio(p.clicks, p.impressions)} />}
                  />
                  <Kpi label="Impressions" value={formatNumber(c.impressions)} delta={<Delta cur={c.impressions} prev={p.impressions} />} />
                </div>
                <div className="mt-3 rounded-xl border border-zinc-200 p-4">
                  <DailyChart
                    label="Daily spend and results"
                    bar="Spend"
                    barCurrency={d.currency}
                    line={d.resultLabel}
                    data={d.series.map((s) => ({ date: s.date, bar: s.spend, line: s.results }))}
                  />
                </div>
              </>
            )}
          </section>

          {d.campaigns.length > 0 && (
            <section>
              <h2 className="mb-3 font-semibold">Campaigns</h2>
              <div className="overflow-x-auto rounded-xl border border-zinc-200">
                <table className="w-full min-w-[840px] text-sm">
                  <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Campaign</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium">Goal</th>
                      <th className="px-3 py-2.5 text-right font-medium">Spend</th>
                      <th className="px-3 py-2.5 text-right font-medium">Results</th>
                      <th className="px-3 py-2.5 text-right font-medium">Cost / result</th>
                      <th className="px-3 py-2.5 text-right font-medium">CTR</th>
                      <th className="px-4 py-2.5 font-medium">Daily spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {d.campaigns.map((r) => {
                      const s = statusOf(r.status)
                      return (
                        <tr key={r.id} className="hover:bg-zinc-50/60">
                          <td className="max-w-[260px] px-4 py-3">
                            <Link href={`/app/dashboard/ads/${r.id}?days=${period}`} className="block truncate font-medium hover:underline">
                              {r.name}
                            </Link>
                            <span className="block truncate text-xs text-zinc-500">
                              {r.account}
                              {r.dailyBudget ? ` · ${formatMoney(r.dailyBudget, r.currency)}/day` : r.lifetimeBudget ? ` · ${formatMoney(r.lifetimeBudget, r.currency)} total` : ''}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${s.cls}`}>{s.label}</span>
                          </td>
                          <td className="px-3 py-3">
                            {goalOf.get(r.id) ? (
                              <GoalDot status={goalOf.get(r.id)!} />
                            ) : (
                              <Link href="/app/goals" className="text-xs text-zinc-400 hover:text-zinc-700">
                                + set
                              </Link>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatMoney(r.spend, r.currency)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {formatNumber(r.results)} <span className="text-xs text-zinc-400">{r.resultLabel.toLowerCase()}</span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {r.costPerResult === null ? '—' : formatMoney(r.costPerResult, r.currency)}
                            {r.perThousand && r.costPerResult !== null && <span className="text-xs text-zinc-400"> / 1k</span>}
                            <div>
                              <Delta cur={r.costPerResult} prev={r.prevCostPerResult} lowerIsBetter />
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatPercent(r.ctr)}</td>
                          <td className="px-4 py-3">
                            <Sparkline values={r.spark} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Organic */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex gap-1">
                <SiFacebook size={14} color="#1877F2" />
                <SiInstagram size={14} color="#E4405F" />
              </span>
              <h2 className="font-semibold">Posts</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Kpi label="Posts published" value={formatNumber(c.posts)} delta={<Delta cur={c.posts} prev={p.posts} />} />
              <Kpi label="Reach" value={formatNumber(c.organicReach)} delta={<Delta cur={c.organicReach} prev={p.organicReach} />} />
              <Kpi label="Engagements" value={formatNumber(c.engagements)} delta={<Delta cur={c.engagements} prev={p.engagements} />} />
              <Kpi label="Engagement rate" value={formatPercent(er, 1)} delta={<Delta cur={er} prev={prevEr} />} />
            </div>
            {c.posts > 0 && (
              <div className="mt-3 rounded-xl border border-zinc-200 p-4">
                <DailyChart
                  label="Daily reach and engagements of published posts"
                  bar="Reach"
                  line="Engagements"
                  data={d.series.map((s) => ({ date: s.date, bar: s.organicReach, line: s.engagements }))}
                />
              </div>
            )}
            {d.connected.organic === 0 && (
              <p className="mt-3 text-sm text-zinc-500">
                <Link href="/app/channels" className="font-medium text-zinc-900 underline">
                  Connect Facebook or Instagram
                </Link>{' '}
                to publish from Khma and measure every post.
              </p>
            )}
          </section>

          {d.topPosts.length > 0 && (
            <section>
              <h2 className="mb-3 font-semibold">Top posts</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {d.topPosts.map((t) => (
                  <div key={t.deliveryId} className="flex min-w-0 gap-3 rounded-xl border border-zinc-200 p-3">
                    {t.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.image} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="h-16 w-16 shrink-0 rounded-lg bg-zinc-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/posts/${t.id}`} className="line-clamp-2 text-sm hover:underline">
                        {t.text || 'Untitled'}
                      </Link>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-zinc-500">
                        {t.network === 'INSTAGRAM' ? <SiInstagram size={11} color="#E4405F" /> : <SiFacebook size={11} color="#1877F2" />}
                        <span>
                          Reach <b className="text-zinc-800">{formatNumber(t.reach)}</b>
                        </span>
                        <span>
                          Engagements <b className="text-zinc-800">{formatNumber(t.engagements)}</b>
                        </span>
                        {t.permalink && (
                          <a href={t.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-zinc-800" aria-label="Open on the network">
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
