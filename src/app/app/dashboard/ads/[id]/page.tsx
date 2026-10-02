import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { DailyChart } from '@/components/charts'
import { PERIODS } from '@/lib/analytics'
import { requireContext } from '@/lib/context'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { resultLabel } from '@/lib/meta-ads'
import { prisma } from '@/lib/prisma'
import { dayIn, isValidTimeZone } from '@/lib/time'

export const metadata: Metadata = { title: 'Ad campaign — Khma' }

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const ratio = (a: number, b: number) => (b > 0 ? a / b : null)

export default async function AdCampaignPage({ params, searchParams }: PageProps<'/app/dashboard/ads/[id]'>) {
  const { workspace } = await requireContext()
  const { id } = await params
  const q = await searchParams
  const period = PERIODS.find((p) => String(p) === q.days) ?? 30
  const c = await prisma.adCampaign.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { socialAccount: { select: { name: true, meta: true } } },
  })
  if (!c) notFound()
  const tzRaw = (c.socialAccount.meta as { timeZone?: string } | null)?.timeZone
  const tz = tzRaw && isValidTimeZone(tzRaw) ? tzRaw : 'UTC'
  const to = dayIn(new Date(), tz)
  const from = shift(to, -(period - 1))
  const days = await prisma.adInsightDay.findMany({ where: { campaignId: c.id, date: { gte: from, lte: to } }, orderBy: { date: 'asc' } })
  const byDay = new Map(days.map((d) => [d.date, d]))
  const series: { date: string; bar: number; line: number }[] = []
  for (let d = from; d <= to; d = shift(d, 1)) series.push({ date: d, bar: byDay.get(d)?.spend ?? 0, line: byDay.get(d)?.results ?? 0 })

  const t = days.reduce(
    (s, d) => ({ spend: s.spend + d.spend, results: s.results + d.results, impressions: s.impressions + d.impressions, clicks: s.clicks + d.clicks, revenue: s.revenue + d.revenue }),
    { spend: 0, results: 0, impressions: 0, clicks: 0, revenue: 0 },
  )
  const label = resultLabel(days.find((d) => d.resultType)?.resultType)
  const cards: [string, string][] = [
    ['Spend', formatMoney(t.spend, c.currency)],
    [label, formatNumber(t.results)],
    ['Cost per result', t.results ? formatMoney(t.spend / t.results, c.currency) : '—'],
    ['CTR', formatPercent(ratio(t.clicks, t.impressions))],
    ['CPM', t.impressions ? formatMoney((t.spend / t.impressions) * 1000, c.currency) : '—'],
    ...(t.revenue > 0 ? ([['ROAS', `${(t.revenue / Math.max(t.spend, 0.01)).toFixed(2)}×`]] as [string, string][]) : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/app/dashboard?days=${period}`} className="grid h-10 w-10 place-items-center rounded-lg bg-zinc-100 hover:bg-zinc-200" aria-label="Back to dashboard">
          <ArrowLeft size={18} />
        </Link>
        <div className="mr-auto min-w-0">
          <h1 className="truncate text-xl font-semibold">{c.name}</h1>
          <p className="text-sm text-zinc-500">
            {c.socialAccount.name} · {c.objective?.replace(/^OUTCOME_/, '').toLowerCase() ?? 'campaign'} · {c.status.toLowerCase().replace(/_/g, ' ')}
            {c.dailyBudget ? ` · ${formatMoney(c.dailyBudget, c.currency)}/day` : ''}
          </p>
        </div>
        <nav className="flex rounded-lg bg-zinc-100 p-1 text-sm" aria-label="Period">
          {PERIODS.map((n) => (
            <Link
              key={n}
              href={`/app/dashboard/ads/${c.id}?days=${n}`}
              aria-current={n === period ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 font-medium ${n === period ? 'bg-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
            >
              {n} days
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-zinc-200 p-4">
            <p className="text-xs font-medium text-zinc-500">{k}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{v}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-200 p-4">
        <DailyChart label="Daily spend and results" bar="Spend" barCurrency={c.currency} line={label} data={series} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Day</th>
              <th className="px-3 py-2.5 text-right font-medium">Spend</th>
              <th className="px-3 py-2.5 text-right font-medium">{label}</th>
              <th className="px-3 py-2.5 text-right font-medium">Cost / result</th>
              <th className="px-3 py-2.5 text-right font-medium">Impressions</th>
              <th className="px-4 py-2.5 text-right font-medium">CTR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 tabular-nums">
            {[...days].reverse().map((d) => (
              <tr key={d.date}>
                <td className="px-4 py-2.5">{d.date}</td>
                <td className="px-3 py-2.5 text-right">{formatMoney(d.spend, c.currency)}</td>
                <td className="px-3 py-2.5 text-right">{formatNumber(d.results)}</td>
                <td className="px-3 py-2.5 text-right">{d.results ? formatMoney(d.spend / d.results, c.currency) : '—'}</td>
                <td className="px-3 py-2.5 text-right">{formatNumber(d.impressions)}</td>
                <td className="px-4 py-2.5 text-right">{formatPercent(ratio(d.clicks, d.impressions))}</td>
              </tr>
            ))}
            {days.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  No delivery in this period
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
