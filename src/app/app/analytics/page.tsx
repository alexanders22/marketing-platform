import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Globe, Megaphone, PenLine } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { DeltaPill } from '@/components/viz'
import { appLang } from '@/lib/app-lang-server'
import { DASH, type MetricKey } from '@/lib/dash-copy'
import { PERIODS, type Period } from '@/lib/analytics'
import { requireContext } from '@/lib/context'
import { formatMoney, formatNumber } from '@/lib/format'
import { resultsOf, type Step } from '@/lib/results'

export const metadata: Metadata = { title: 'Analytics — Loudpilot' }

const card = 'rounded-2xl border border-zinc-200 bg-white'
const BAR = ['bg-[#7b3ff2]', 'bg-[#9b5cf6]', 'bg-[#c04ddb]', 'bg-[#ff2e6e]', 'bg-[#ff5b14]']
// How to start measuring a step that has no numbers yet.
const START: Record<Step['key'], { href: string; label: string }> = {
  seen: { href: '/app/channels', label: 'Connect Meta Ads or your pages' },
  clicked: { href: '/app/channels', label: 'Connect Meta Ads' },
  visited: { href: '/app/website/tag', label: 'Install the Loudpilot Tag' },
  leads: { href: '/app/website/tag', label: 'Install the Loudpilot Tag' },
  customers: { href: '/app/website/tag', label: 'Install the Loudpilot Tag' },
}

// Each step's plain-words explanation (Dashboard copy).
const TIP: Record<Step['key'], MetricKey> = { seen: 'views', clicked: 'clicks', visited: 'visits', leads: 'leads', customers: 'sales' }

const pct = (r: number) => `${r >= 0.1 ? (r * 100).toFixed(0) : r >= 0.001 ? (r * 100).toFixed(1) : (r * 100).toFixed(2)}%`

export default async function AnalyticsPage({ searchParams }: PageProps<'/app/analytics'>) {
  const { workspace } = await requireContext()
  const t = DASH[await appLang()]
  const q = await searchParams
  const days = (PERIODS.find((p) => String(p) === q.days) ?? 30) as Period
  const r = await resultsOf(workspace.id, days)
  const m = r.money
  const money = (v: number | null, cur: string | null = m.currency) => (v === null ? '—' : formatMoney(v, cur, v >= 100 ? 0 : 2))
  const range = `${new Date(`${r.from}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(`${r.to}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-zinc-500">From the first view of an ad or post to the sale — ads, posts and your website together. {range}.</p>
        </div>
        <nav aria-label="Period" className="flex rounded-lg bg-zinc-100 p-1 text-sm">
          {PERIODS.map((p) => (
            <Link key={p} href={`/app/analytics?days=${p}`} aria-current={p === days ? 'page' : undefined} className={`rounded-md px-3 py-1 font-medium ${p === days ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>
              {p} days
            </Link>
          ))}
        </nav>
      </div>

      <section aria-labelledby="funnel">
        <h2 id="funnel" className="sr-only">
          From view to sale
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="From view to sale">
          {r.steps.map((s, i) => {
            const before = r.steps[i - 1]
            const rate = before?.value && s.value !== null ? s.value / before.value : null
            return (
              <li key={s.key} className={`${card} relative flex flex-col overflow-hidden p-4`} aria-label={s.label}>
                <span className={`absolute inset-x-0 top-0 h-1 ${BAR[i]}`} />
                <p className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-700">{i + 1}</span>
                  {s.label} <Hint text={t.metric[TIP[s.key]].tip} label={`${t.whatIs} ${s.label}`} />
                </p>
                {s.value === null ? (
                  <>
                    <p className="mt-3 text-2xl font-semibold text-zinc-300">—</p>
                    <Link href={START[s.key].href} className="mt-auto pt-3 text-xs font-medium text-indigo-600 hover:underline">
                      {START[s.key].label} →
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="mt-3 flex items-baseline gap-2">
                      <span className="text-2xl font-semibold tracking-tight tabular-nums" data-testid={`step-${s.key}`} title={s.value.toLocaleString('en-US')}>
                        {formatNumber(s.value)}
                      </span>
                      <DeltaPill cur={s.value} prev={s.prev} />
                    </p>
                    {rate !== null && <p className="mt-1 text-xs text-zinc-600">{rate > 1 ? `${rate.toFixed(1)}× the step before` : `${pct(rate)} of the step before`}</p>}
                    {s.detail && <p className="mt-1 text-xs text-zinc-500">{s.detail}</p>}
                    <p className="mt-auto pt-3 text-[11px] text-zinc-400">{s.source}</p>
                  </>
                )}
              </li>
            )
          })}
        </ol>
      </section>

      <section aria-labelledby="money">
        <h2 id="money" className="mb-3 font-semibold">
          What it cost and what came back
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Ad spend" tip={t.metric.spend.tip} whatIs={t.whatIs} value={money(m.spend)} hint={m.spend === null ? 'Connect Meta Ads' : undefined}>
            <DeltaPill cur={m.spend} prev={m.prevSpend} neutral />
          </Tile>
          <Tile label="Cost per lead" tip={t.analytics.costPerLead} whatIs={t.whatIs} value={money(m.costPerLead)} hint={m.costPerLead === null ? 'Ad spend and leads both needed' : 'Ad spend ÷ leads'}>
            <DeltaPill cur={m.costPerLead} prev={m.prevCostPerLead} lowerIsBetter />
          </Tile>
          <Tile label="Cost per customer" tip={t.analytics.costPerCustomer} whatIs={t.whatIs} value={money(m.costPerCustomer)} hint={m.costPerCustomer === null ? 'Sales come from the Loudpilot Tag' : 'Ad spend ÷ customers'} />
          <Tile
            label="Return on ad spend"
            tip={t.analytics.roas}
            whatIs={t.whatIs}
            value={m.roas === null ? '—' : `${m.roas.toFixed(1)}×`}
            hint={m.revenue ? `${money(m.revenue)} in sales` : 'Sales ÷ ad spend'}
          />
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="sources" className={`${card} p-5`}>
          <div className="mb-3 flex items-center gap-2">
            <h2 id="sources" className="mr-auto flex items-center gap-2 font-semibold">
              <Globe size={16} className="text-sky-600" /> Where customers come from
            </h2>
            {r.connected.tag && (
              <Link href={`/app/website/tag?d=${days}`} className="text-sm font-medium text-indigo-600 hover:underline">
                Full report
              </Link>
            )}
          </div>
          {!r.connected.tag ? (
            <Empty href="/app/website/tag" cta="Install the Loudpilot Tag">
              One line on your website shows which ads, posts and links bring visitors, leads and sales.
            </Empty>
          ) : r.sources.length === 0 ? (
            <p className="text-sm text-zinc-500">No visits in this period yet.</p>
          ) : (
            <table className="w-full table-fixed text-sm" aria-label="Sources">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="w-[40%] py-1.5 font-medium">Source</th>
                  <th className="py-1.5 text-right font-medium">Visits</th>
                  <th className="py-1.5 text-right font-medium">Leads</th>
                  <th className="py-1.5 text-right font-medium">Sales</th>
                  <th className="py-1.5 text-right font-medium">Per lead</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {r.sources.map((s) => (
                  <tr key={s.key}>
                    <td className="max-w-0 py-2 pr-2">
                      <span className="block truncate font-medium">{s.adCampaign ?? (s.source === '(direct)' ? 'Direct' : `${s.source} / ${s.medium}`)}</span>
                      {s.campaign && !s.adCampaign && <span className="block truncate text-xs text-zinc-500">{s.campaign}</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatNumber(s.visits)}</td>
                    <td className="py-2 text-right tabular-nums">{formatNumber(s.leads)}</td>
                    <td className="py-2 text-right tabular-nums">{formatNumber(s.purchases)}</td>
                    <td className="py-2 text-right tabular-nums text-zinc-600">{s.spend !== null && s.leads ? money(s.spend / s.leads, s.currency) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section aria-labelledby="ads" className={`${card} p-5`}>
          <div className="mb-3 flex items-center gap-2">
            <h2 id="ads" className="mr-auto flex items-center gap-2 font-semibold">
              <Megaphone size={16} className="text-orange-600" /> Ad campaigns
            </h2>
            {r.connected.ads && (
              <Link href={`/app/analytics/details?days=${days}`} className="text-sm font-medium text-indigo-600 hover:underline">
                All campaigns
              </Link>
            )}
          </div>
          {!r.connected.ads ? (
            <Empty href="/app/channels" cta="Connect Meta Ads">
              Spend, results and cost per result of every campaign, next to what they brought to your website.
            </Empty>
          ) : r.campaigns.length === 0 ? (
            <p className="text-sm text-zinc-500">No campaign spent in this period.</p>
          ) : (
            <table className="w-full table-fixed text-sm" aria-label="Ad campaigns">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="w-[45%] py-1.5 font-medium">Campaign</th>
                  <th className="py-1.5 text-right font-medium">Spend</th>
                  <th className="py-1.5 text-right font-medium">Results</th>
                  <th className="py-1.5 text-right font-medium">Per result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {r.campaigns.map((c) => (
                  <tr key={c.id}>
                    <td className="max-w-0 py-2 pr-2">
                      <Link href={`/app/dashboard/ads/${c.id}?days=${days}`} className="block truncate font-medium hover:underline">
                        {c.name}
                      </Link>
                      <span className="block truncate text-xs text-zinc-500">
                        {c.status === 'ACTIVE' ? 'Running' : 'Paused'} · {c.resultLabel}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{money(c.spend, c.currency)}</td>
                    <td className="py-2 text-right tabular-nums">{formatNumber(c.results)}</td>
                    <td className="py-2 text-right tabular-nums text-zinc-600">
                      {money(c.costPerResult, c.currency)}
                      {c.perThousand && c.costPerResult !== null ? ' / 1k' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {r.posts.length > 0 && (
        <section aria-labelledby="posts" className={`${card} p-5`}>
          <h2 id="posts" className="mb-3 flex items-center gap-2 font-semibold">
            <PenLine size={16} className="text-pink-600" /> Posts that worked best
          </h2>
          <ul className="grid gap-3 md:grid-cols-3">
            {r.posts.map((p) => (
              <li key={p.deliveryId} className="flex gap-3 rounded-xl bg-zinc-50 p-3">
                {p.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm">{p.text || 'Post'}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatNumber(p.reach)} reached · {formatNumber(p.engagements)} reactions
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href="/app/weekly" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline">
          Weekly review: what to do next <ArrowRight size={14} />
        </Link>
        <Link href="/app/goals" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline">
          Goals Loudpilot watches <ArrowRight size={14} />
        </Link>
      </p>
    </div>
  )
}

function Tile({ label, tip, whatIs, value, hint, children }: { label: string; tip: string; whatIs: string; value: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className={`${card} p-4`}>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        {label} <Hint text={tip} label={`${whatIs} ${label}`} />
      </dt>
      <dd className="mt-2 flex items-baseline gap-2">
        <span className={`text-xl font-semibold tabular-nums ${value === '—' ? 'text-zinc-300' : ''}`}>{value}</span>
        {children}
      </dd>
      {hint && <dd className="mt-1 text-xs text-zinc-500">{hint}</dd>}
    </div>
  )
}

function Empty({ href, cta, children }: { href: string; cta: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-5 text-center text-sm text-zinc-500">
      <p>{children}</p>
      <Link href={href} className="mt-3 inline-block rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-800">
        {cta}
      </Link>
    </div>
  )
}
