import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  ArrowRight,
  BarChart3,
  Eye,
  Flame,
  Globe,
  Heart,
  Megaphone,
  MousePointerClick,
  PenLine,
  Plug,
  Sparkles,
  Target,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { SiFacebook, SiInstagram } from 'react-icons/si'
import { DeltaPill, Donut, Funnel, Sparkline, StatTile, TrendChart } from '@/components/viz'
import { VIZ } from '@/lib/viz'
import { LocalTime } from '@/components/LocalTime'
import type { PerformanceSummary } from '@/lib/ai'
import { PERIODS, dashboard, parseRange, type Period } from '@/lib/analytics'
import { requireContext } from '@/lib/context'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { STATUS as GOAL_STATUS } from '../../goals/GoalCards'
import { DateFilter } from './DateFilter'
import { SummaryCard } from './SummaryCard'
import { SyncButton } from './SyncButton'
import { ShowMore } from '@/components/ShowMore'

export const metadata: Metadata = { title: 'Ads & posts — Loudpilot' }

// One color per metric, the same everywhere on the page.
const C = { spend: VIZ.series[0], results: VIZ.series[1], visits: VIZ.series[3], events: VIZ.series[2], reach: '#db2777', engage: VIZ.series[1] }

const STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PAUSED: { label: 'Paused', cls: 'bg-zinc-100 text-zinc-600 ring-zinc-200' },
  CAMPAIGN_PAUSED: { label: 'Paused', cls: 'bg-zinc-100 text-zinc-600 ring-zinc-200' },
  ADSET_PAUSED: { label: 'Paused', cls: 'bg-zinc-100 text-zinc-600 ring-zinc-200' },
  IN_PROCESS: { label: 'Processing', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  PENDING_REVIEW: { label: 'In review', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  WITH_ISSUES: { label: 'Issues', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  DISAPPROVED: { label: 'Rejected', cls: 'bg-red-50 text-red-700 ring-red-200' },
  ARCHIVED: { label: 'Archived', cls: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
  DELETED: { label: 'Deleted', cls: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
}
const statusOf = (s: string) => STATUS[s] ?? { label: s.toLowerCase().replace(/_/g, ' '), cls: 'bg-zinc-100 text-zinc-600 ring-zinc-200' }

const ratio = (a: number, b: number) => (b > 0 ? a / b : null)
const card = 'rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,16,32,0.04)]'

function Section({ icon, tint, title, sub, right, children, id }: { icon: ReactNode; tint: string; title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={`grid h-8 w-8 place-items-center rounded-xl ${tint}`}>{icon}</span>
        <h2 id={id} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {sub && <span className="text-xs text-zinc-500">{sub}</span>}
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </section>
  )
}

function ChartCard({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className={`${card} p-4`}>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm font-semibold text-zinc-800">{title}</p>
        {right && <span className="ml-auto text-xs text-zinc-500">{right}</span>}
      </div>
      {children}
    </div>
  )
}

export default async function DashboardPage({ searchParams }: PageProps<'/app/dashboard'>) {
  const { workspace } = await requireContext()
  const q = await searchParams
  const range = parseRange(q.from, q.to)
  const period = (PERIODS.find((p) => String(p) === q.days) ?? 30) as Period
  const d = await dashboard(workspace.id, range ?? period)
  // The latest summary for the standard periods; a custom range starts fresh.
  const last = range ? null : await prisma.aiSummary.findFirst({ where: { workspaceId: workspace.id, periodDays: period }, orderBy: { createdAt: 'desc' } })
  const summary = last ? (JSON.parse(last.text) as PerformanceSummary) : null
  const allGoals = await prisma.goal.findMany({ where: { workspaceId: workspace.id, active: true }, select: { adCampaignId: true, status: true } })
  // Worst goal status per ad campaign, for the campaigns table.
  const RANK = { OFF_TRACK: 3, AT_RISK: 2, ON_TRACK: 1, NO_DATA: 0 } as const
  const goalOf = new Map<string, keyof typeof RANK>()
  for (const g of allGoals) {
    if (!g.adCampaignId) continue
    const before = goalOf.get(g.adCampaignId)
    if (!before || RANK[g.status] > RANK[before]) goalOf.set(g.adCampaignId, g.status)
  }

  const c = d.current
  const p = d.previous
  const cur = d.currency
  const money = (v: number) => formatMoney(v, cur, v >= 100 ? 0 : 2)
  const cpr = ratio(d.resultSpend.current, c.results)
  const prevCpr = ratio(d.resultSpend.previous, p.results)
  const er = ratio(c.engagements, c.organicReach)
  const prevEr = ratio(p.engagements, p.organicReach)
  const nothing = d.connected.ads === 0 && d.connected.organic === 0 && c.posts === 0 && !d.website
  const dates = d.series.map((s) => s.date)
  const col = (k: keyof (typeof d.series)[number]) => d.series.map((s) => Number(s[k]))
  const daily = (f: (s: (typeof d.series)[number]) => number | null) => d.series.map((s) => f(s) ?? 0)
  const w = d.website
  const resultOne = d.resultLabel === 'Results' ? 'result' : d.resultLabel.toLowerCase().replace(/s$/, '')
  const paid = w?.channels.find((x) => /paid/i.test(x.channel))

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Ads & posts</h1>
          <p className="text-sm text-zinc-500">
            {d.from} – {d.to} · every number of your ads, posts and website (Google Analytics)
          </p>
        </div>
        <DateFilter period={period} range={range} />
        {d.connected.ads > 0 && <SyncButton />}
      </div>

      {nothing ? (
        <section className="rounded-3xl border border-dashed border-violet-200 bg-violet-50/40 p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white">
            <BarChart3 size={22} />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Connect your accounts to see results</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            Connect a Meta ad account to follow spend, leads and cost per result, your Facebook Page or Instagram to measure posts, and Google Analytics for the website.
          </p>
          <Link href="/app/channels" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white">
            <Plug size={15} /> Connect channels
          </Link>
        </section>
      ) : (
        <>
          {/* The period at a glance */}
          <section aria-label="At a glance" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {d.connected.ads > 0 && (
              <StatTile
                label="Ad spend"
                value={money(c.spend)}
                icon={<Wallet size={15} />}
                tint="bg-violet-50 text-violet-600"
                delta={<DeltaPill cur={c.spend} prev={p.spend} neutral />}
                spark={<Sparkline values={col('spend')} dates={dates} color={C.spend} unit={{ kind: 'money', currency: cur }} label="Ad spend by day" />}
              />
            )}
            {d.connected.ads > 0 && (
              <StatTile
                label={d.resultLabel}
                value={formatNumber(c.results)}
                icon={<Target size={15} />}
                tint="bg-orange-50 text-orange-600"
                delta={<DeltaPill cur={c.results} prev={p.results} />}
                spark={<Sparkline values={col('results')} dates={dates} color={C.results} label={`Daily ${d.resultLabel.toLowerCase()}`} />}
                foot={cpr !== null ? `${formatMoney(cpr, cur)} per ${resultOne}` : undefined}
              />
            )}
            {w && (
              <StatTile
                label="Website visits"
                value={formatNumber(w.current.sessions)}
                icon={<Globe size={15} />}
                tint="bg-sky-50 text-sky-600"
                delta={<DeltaPill cur={w.current.sessions} prev={w.previous.sessions} />}
                spark={<Sparkline values={w.series.map((s) => s.sessions)} dates={w.series.map((s) => s.date)} color={C.visits} label="Daily website visits" />}
                foot={`${formatNumber(w.current.keyEvents)} key events`}
              />
            )}
            {(d.connected.organic > 0 || c.posts > 0) && (
              <StatTile
                label="Post reach"
                value={formatNumber(c.organicReach)}
                icon={<Eye size={15} />}
                tint="bg-pink-50 text-pink-600"
                delta={<DeltaPill cur={c.organicReach} prev={p.organicReach} />}
                spark={<Sparkline values={col('organicReach')} dates={dates} color={C.reach} label="Daily post reach" />}
                foot={`${formatNumber(c.posts)} posts · ${formatPercent(er, 1)} engagement`}
              />
            )}
          </section>

          <SummaryCard key={range ? `${range.from}-${range.to}` : period} period={period} range={range} initial={summary} createdAt={last?.createdAt.toISOString() ?? null} />

          {d.adAccounts.some((a) => a.status !== 'ACTIVE' || a.lastError) && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
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
          <Section
            id="ads-heading"
            icon={<Megaphone size={16} />}
            tint="bg-violet-50 text-violet-600"
            title="Ads"
            sub={
              d.adAccounts.length > 0 && (
                <>
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
                </>
              )
            }
          >
            {d.connected.ads === 0 ? (
              <p className="rounded-2xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500">
                No ad account connected.{' '}
                <Link href="/app/channels" className="font-medium text-zinc-900 underline">
                  Connect Meta Ads
                </Link>{' '}
                to follow spend, {d.resultLabel.toLowerCase()} and cost per result here.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                  <StatTile label="Spend" value={money(c.spend)} delta={<DeltaPill cur={c.spend} prev={p.spend} neutral />} spark={<Sparkline values={col('spend')} dates={dates} color={C.spend} unit={{ kind: 'money', currency: cur }} label="Daily spend" height={32} />} />
                  <StatTile label={d.resultLabel} value={formatNumber(c.results)} delta={<DeltaPill cur={c.results} prev={p.results} />} spark={<Sparkline values={col('results')} dates={dates} color={C.results} label={`Daily ${d.resultLabel.toLowerCase()}`} height={32} />} />
                  <StatTile
                    label={`Cost per ${resultOne}`}
                    value={cpr === null ? '—' : formatMoney(cpr, cur)}
                    delta={<DeltaPill cur={cpr} prev={prevCpr} lowerIsBetter />}
                    spark={<Sparkline values={daily((s) => ratio(s.spend, s.results))} dates={dates} color={C.spend} unit={{ kind: 'money', currency: cur }} label={`Daily cost per ${resultOne}`} height={32} />}
                  />
                  <StatTile
                    label="CTR"
                    value={formatPercent(ratio(c.clicks, c.impressions))}
                    delta={<DeltaPill cur={ratio(c.clicks, c.impressions)} prev={ratio(p.clicks, p.impressions)} />}
                    spark={<Sparkline values={daily((s) => ratio(s.clicks, s.impressions))} dates={dates} color={C.spend} unit={{ kind: 'percent' }} label="Daily click-through rate" height={32} />}
                  />
                  <StatTile label="Impressions" value={formatNumber(c.impressions)} delta={<DeltaPill cur={c.impressions} prev={p.impressions} />} spark={<Sparkline values={col('impressions')} dates={dates} color={C.spend} label="Daily impressions" height={32} />} />
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <ChartCard title="Daily spend">
                    <TrendChart data={d.series.map((s) => ({ date: s.date, value: s.spend }))} kind="bars" color={C.spend} unit={{ kind: 'money', currency: cur }} label="Daily ad spend" />
                  </ChartCard>
                  <ChartCard title={`Daily ${d.resultLabel.toLowerCase()}`}>
                    <TrendChart data={d.series.map((s) => ({ date: s.date, value: s.results }))} color={C.results} label={`Daily ${d.resultLabel.toLowerCase()}`} />
                  </ChartCard>
                </div>
              </>
            )}
          </Section>

          {/* From ad to customer */}
          {d.connected.ads > 0 && w && paid && c.impressions > 0 && (
            <Section id="funnel-heading" icon={<MousePointerClick size={16} />} tint="bg-fuchsia-50 text-fuchsia-600" title="From ad to customer" sub="Meta ads → Google Analytics, this period">
              <div className={`${card} p-5`}>
                <Funnel
                  label="From ad impressions to key events"
                  steps={[
                    { label: 'Ad impressions', value: c.impressions },
                    { label: 'Ad clicks', value: c.clicks, hint: 'clicked the ad' },
                    { label: 'Visits from paid social', value: paid.sessions, hint: 'reached the website' },
                    { label: 'Key events from paid social', value: paid.keyEvents, hint: 'signed up, left a lead or bought' },
                  ]}
                />
              </div>
            </Section>
          )}

          {w ? (
            <Website d={d} money={money} />
          ) : (
            <Link href="/app/channels" className="flex items-center gap-4 rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 p-5 text-sm text-zinc-600 hover:border-sky-300">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-sky-600 ring-1 ring-sky-200">
                <Globe size={18} />
              </span>
              <span>
                <b className="block text-zinc-900">Connect Google Analytics</b>
                See what ads bring to your website — visits, sign-ups, leads and the cost of each.
              </span>
            </Link>
          )}

          {d.campaigns.length > 0 && (
            <Section id="campaigns-heading" icon={<BarChart3 size={16} />} tint="bg-zinc-100 text-zinc-700" title="Ad campaigns">
              <div className={`${card} overflow-x-auto`}>
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="text-left text-xs text-zinc-500">
                    <tr className="border-b border-zinc-100">
                      <th className="px-4 py-3 font-medium">Campaign</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Goal</th>
                      <th className="px-3 py-3 text-right font-medium">Spend</th>
                      <th className="px-3 py-3 text-right font-medium">Results</th>
                      <th className="px-3 py-3 text-right font-medium">Cost / result</th>
                      <th className="px-3 py-3 text-right font-medium">CTR</th>
                      <th className="w-40 px-4 py-3 font-medium">Daily spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    <ShowMore as="tr" colSpan={8}>
                      {d.campaigns.map((r) => {
                        const s = statusOf(r.status)
                        const gs = goalOf.get(r.id)
                        const G = gs ? GOAL_STATUS[gs] : null
                        return (
                          <tr key={r.id} className="transition hover:bg-violet-50/40">
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
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ${s.cls}`}>{s.label}</span>
                            </td>
                            <td className="px-3 py-3">
                              {G ? (
                                <Link href="/app/goals" className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-zinc-700 hover:underline">
                                  <G.icon size={13} style={{ color: G.ring }} /> {G.label}
                                </Link>
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
                              <div className="mt-0.5">
                                <DeltaPill cur={r.costPerResult} prev={r.prevCostPerResult} lowerIsBetter />
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">{formatPercent(r.ctr)}</td>
                            <td className="px-4 py-3">
                              <Sparkline values={r.spark} color={C.spend} unit={{ kind: 'money', currency: r.currency }} label={`${r.name}: daily spend`} height={28} />
                            </td>
                          </tr>
                        )
                      })}
                    </ShowMore>
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Organic */}
          <Section
            id="posts-heading"
            icon={
              <span className="flex gap-0.5">
                <SiFacebook size={12} color="#1877F2" />
                <SiInstagram size={12} color="#E4405F" />
              </span>
            }
            tint="bg-pink-50"
            title="Posts"
          >
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatTile label="Posts published" value={formatNumber(c.posts)} icon={<PenLine size={15} />} tint="bg-pink-50 text-pink-600" delta={<DeltaPill cur={c.posts} prev={p.posts} />} spark={<Sparkline values={col('posts')} dates={dates} color={C.reach} label="Posts per day" height={32} />} />
              <StatTile label="Reach" value={formatNumber(c.organicReach)} icon={<Users size={15} />} tint="bg-pink-50 text-pink-600" delta={<DeltaPill cur={c.organicReach} prev={p.organicReach} />} spark={<Sparkline values={col('organicReach')} dates={dates} color={C.reach} label="Daily reach" height={32} />} />
              <StatTile label="Engagements" value={formatNumber(c.engagements)} icon={<Heart size={15} />} tint="bg-orange-50 text-orange-600" delta={<DeltaPill cur={c.engagements} prev={p.engagements} />} spark={<Sparkline values={col('engagements')} dates={dates} color={C.engage} label="Daily engagements" height={32} />} />
              <StatTile label="Engagement rate" value={formatPercent(er, 1)} icon={<Sparkles size={15} />} tint="bg-orange-50 text-orange-600" delta={<DeltaPill cur={er} prev={prevEr} />} spark={<Sparkline values={daily((s) => ratio(s.engagements, s.organicReach))} dates={dates} color={C.engage} unit={{ kind: 'percent' }} label="Daily engagement rate" height={32} />} />
            </div>
            {c.posts > 0 && (
              <div className="grid gap-3 lg:grid-cols-2">
                <ChartCard title="Reach of published posts">
                  <TrendChart data={d.series.map((s) => ({ date: s.date, value: s.organicReach }))} kind="bars" color={C.reach} label="Daily reach of published posts" />
                </ChartCard>
                <ChartCard title="Engagements">
                  <TrendChart data={d.series.map((s) => ({ date: s.date, value: s.engagements }))} kind="bars" color={C.engage} label="Daily engagements" />
                </ChartCard>
              </div>
            )}
            {d.connected.organic === 0 && (
              <p className="text-sm text-zinc-500">
                <Link href="/app/channels" className="font-medium text-zinc-900 underline">
                  Connect Facebook or Instagram
                </Link>{' '}
                to publish from Loudpilot and measure every post.
              </p>
            )}
          </Section>

          {d.topPosts.length > 0 && (
            <Section id="top-heading" icon={<Flame size={16} />} tint="bg-orange-50 text-orange-600" title="Top posts">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {d.topPosts.map((t, i) => (
                  <div key={t.deliveryId} className={`${card} relative flex min-w-0 gap-3 p-3`}>
                    <span className={`absolute -top-2 -left-2 grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white shadow ${i === 0 ? 'bg-gradient-to-br from-amber-300 to-orange-500' : i === 1 ? 'bg-zinc-400' : i === 2 ? 'bg-amber-700' : 'bg-zinc-300'}`}>{i + 1}</span>
                    {t.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.image} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-pink-100 to-violet-100 text-violet-400">
                        <PenLine size={20} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/posts/${t.id}`} className="line-clamp-2 text-sm font-medium hover:underline">
                        {t.text || 'Untitled'}
                      </Link>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                        {t.network === 'INSTAGRAM' ? <SiInstagram size={12} color="#E4405F" /> : <SiFacebook size={12} color="#1877F2" />}
                        <span className="inline-flex items-center gap-1">
                          <Eye size={12} /> <b className="text-zinc-800">{formatNumber(t.reach)}</b>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Heart size={12} /> <b className="text-zinc-800">{formatNumber(t.engagements)}</b>
                        </span>
                        {t.permalink && (
                          <a href={t.permalink} target="_blank" rel="noreferrer" className="hover:text-zinc-800" aria-label="Open on the network">
                            <ArrowRight size={12} className="-rotate-45" />
                          </a>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  )
}

// Google Analytics: visits and key events, and what each key event cost in ads.
function Website({ d, money }: { d: Awaited<ReturnType<typeof dashboard>>; money: (v: number) => string }) {
  const w = d.website!
  const c = w.current
  const p = w.previous
  const cpk = ratio(d.current.spend, c.keyEvents)
  const prevCpk = ratio(d.previous.spend, p.keyEvents)
  const problem = w.properties.find((x) => x.status !== 'ACTIVE' || x.lastError)
  const dates = w.series.map((s) => s.date)
  const maxEvent = Math.max(1, ...w.events.map((e) => e.current))
  return (
    <Section id="website-heading" icon={<Globe size={16} />} tint="bg-sky-50 text-sky-600" title="Website" sub={`${w.properties.map((x) => x.name).join(' · ')} — Google Analytics`}>
      {problem && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          {problem.name}: {problem.status !== 'ACTIVE' ? 'needs reconnecting' : problem.lastError}{' '}
          <Link href="/app/channels" className="font-medium underline">
            Open Channels
          </Link>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Visits" value={formatNumber(c.sessions)} delta={<DeltaPill cur={c.sessions} prev={p.sessions} />} spark={<Sparkline values={w.series.map((s) => s.sessions)} dates={dates} color={C.visits} label="Daily visits" height={32} />} />
        <StatTile label="New users" value={formatNumber(c.newUsers)} icon={<UserPlus size={15} />} tint="bg-sky-50 text-sky-600" delta={<DeltaPill cur={c.newUsers} prev={p.newUsers} />} />
        <StatTile label="Key events" value={formatNumber(c.keyEvents)} delta={<DeltaPill cur={c.keyEvents} prev={p.keyEvents} />} spark={<Sparkline values={w.series.map((s) => s.keyEvents)} dates={dates} color={C.events} label="Daily key events" height={32} />} />
        <StatTile
          label="Conversion rate"
          value={formatPercent(ratio(c.keyEvents, c.sessions), 1)}
          delta={<DeltaPill cur={ratio(c.keyEvents, c.sessions)} prev={ratio(p.keyEvents, p.sessions)} />}
          spark={<Sparkline values={w.series.map((s) => ratio(s.keyEvents, s.sessions) ?? 0)} dates={dates} color={C.events} unit={{ kind: 'percent' }} label="Daily conversion rate" height={32} />}
        />
        {d.current.spend > 0 ? (
          <StatTile label="Ad cost per key event" value={cpk === null ? '—' : money(cpk)} delta={<DeltaPill cur={cpk} prev={prevCpk} lowerIsBetter />} />
        ) : (
          <StatTile label="Revenue" value={c.revenue > 0 ? money(c.revenue) : '—'} delta={<DeltaPill cur={c.revenue} prev={p.revenue} />} />
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Daily visits">
          <TrendChart data={w.series.map((s) => ({ date: s.date, value: s.sessions }))} color={C.visits} label="Daily website visits" />
        </ChartCard>
        <ChartCard title="Daily key events">
          <TrendChart data={w.series.map((s) => ({ date: s.date, value: s.keyEvents }))} kind="bars" color={C.events} label="Daily key events" />
        </ChartCard>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Where visits come from">
          {w.channels.length === 0 ? (
            <p className="text-sm text-zinc-500">No visits in this period.</p>
          ) : (
            <Donut
              label="Visits by channel"
              items={w.channels.map((x) => ({ label: x.channel, value: x.sessions }))}
              center={
                <div>
                  <p className="text-lg font-semibold tabular-nums">{formatNumber(c.sessions)}</p>
                  <p className="text-[11px] text-zinc-500">visits</p>
                </div>
              }
            />
          )}
        </ChartCard>
        <ChartCard title="Key events">
          {w.events.length === 0 ? (
            <p className="text-sm text-zinc-500">No key events yet. Mark sign-ups, leads or purchases as key events in Google Analytics (Admin → Events) to count them here.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {w.events.slice(0, 6).map((e) => (
                <li key={e.name}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-xs text-zinc-700">{e.name}</span>
                    <span className="flex items-center gap-2 tabular-nums">
                      <b>{formatNumber(e.current)}</b> <DeltaPill cur={e.current} prev={e.previous} />
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-emerald-50">
                    <div className="h-full rounded-full" style={{ width: `${(e.current / maxEvent) * 100}%`, background: C.events }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </Section>
  )
}
