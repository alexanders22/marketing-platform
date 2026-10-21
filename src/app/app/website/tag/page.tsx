import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, Code2, ExternalLink, Footprints, MousePointerClick, Radio, ShoppingBag } from 'lucide-react'
import { CodeBlock } from '@/app/docs/CodeBlock'
import { LocalTime } from '@/components/LocalTime'
import { requireContext } from '@/lib/context'
import { siteUrl } from '@/lib/hosts'
import { prisma } from '@/lib/prisma'
import { ensureSite } from '@/lib/tag'
import { liveEvents, tagReport } from '@/lib/tag-report'
import type { TrackingReport } from '@/lib/tracking'
import { CheckInstall, LiveRefresh, SecretBox, TagSettingsForm } from './TagControls'

export const metadata: Metadata = { title: 'Loudpilot Tag — Loudpilot' }

const card = 'rounded-2xl border border-zinc-200 bg-white p-5'
const PERIODS = [7, 30, 90]
const SHORT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
const n = (x: number) => x.toLocaleString('en-US')
const money = (x: number, cur: string | null) => `${x.toLocaleString('en-US', { maximumFractionDigits: 2 })}${cur ? ` ${cur}` : ''}`

export default async function TagPage({ searchParams }: PageProps<'/app/website/tag'>) {
  const { workspace, role, asAdmin } = await requireContext()
  const sp = await searchParams
  const days = PERIODS.includes(Number(sp.d)) ? Number(sp.d) : 30
  const canManage = role !== 'EDITOR' || asAdmin
  const site = await ensureSite(workspace.id)
  const [report, live, audit] = await Promise.all([
    tagReport(site.id, workspace.id, days),
    liveEvents(site.id),
    prisma.websiteAudit.findFirst({ where: { workspaceId: workspace.id, kind: 'TRACKING' }, orderBy: { createdAt: 'desc' } }),
  ])
  const tr = audit?.result as TrackingReport | undefined
  const pixels = [...new Set([...(tr?.pixels.map((p) => p.id) ?? []), ...(tr?.site?.pixelIds ?? [])])]
  const snippet = `<script async src="${siteUrl()}/t.js" data-site="${site.key}"></script>`
  const t = report.totals
  const cur = t.currency

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto max-w-2xl">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Footprints size={22} /> Loudpilot Tag
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            One line of code on your website. See which ads bring people, what they do on the site, who leaves a contact or buys — and send those conversions
            to Meta so your ads learn. It also loads your website chat.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/demo-shop" target="_blank" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50">
            <ShoppingBag size={15} /> Try it in a demo shop
          </a>
          <Link href="/docs/website" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50">
            <BookOpen size={15} /> Developer guide
          </Link>
        </div>
      </div>

      <section className={card} aria-labelledby="install">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="install" className="mr-auto flex items-center gap-2 font-semibold">
            <Code2 size={17} /> Install
          </h2>
          {site.lastEventAt ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
              <Radio size={12} /> Receiving events · last <LocalTime iso={site.lastEventAt.toISOString()} options={SHORT} />
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">Waiting for the first visit</span>
          )}
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          Paste this into the <code className="rounded bg-zinc-100 px-1">&lt;head&gt;</code> of every page (WordPress: a header-scripts plugin; Shopify: theme.liquid; Tilda / Wix:
          custom code in site settings; or Google Tag Manager → Custom HTML, all pages).
        </p>
        <CodeBlock tabs={[{ label: 'html', code: snippet }]} />
        <CheckInstall />
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">Track purchases and other actions</summary>
          <p className="mt-2 text-zinc-600">Page views, calls, WhatsApp / Telegram / e-mail clicks and contact forms are tracked by themselves. Add a line for a purchase on the thank-you page:</p>
          <CodeBlock
            tabs={[
              {
                label: 'js',
                code: `loudpilot('track', 'Purchase', { value: 120, currency: 'GEL', order_id: '1001' })\nloudpilot('identify', { email: 'nino@example.com', phone: '+995599123456', name: 'Nino' })`,
              },
            ]}
          />
          <p className="text-zinc-600">
            Orders paid later, deals won in your CRM: send them from your server — see the{' '}
            <Link href="/docs/website#server-events" className="text-indigo-600">
              developer guide
            </Link>
            .
          </p>
        </details>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">Ad links: let Loudpilot match visits to your campaigns</summary>
          <p className="mt-2 text-zinc-600">
            Meta Ads Manager → ad → Tracking → URL parameters (Google Ads: account settings → Tracking → Final URL suffix). With campaign ids, the report below shows
            each campaign’s spend, cost per lead and return.
          </p>
          <CodeBlock
            tabs={[
              { label: 'Meta', code: 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}' },
              { label: 'Google', code: 'utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}' },
              { label: 'TikTok', code: 'utm_source=tiktok&utm_medium=paid&utm_campaign=__CAMPAIGN_ID__&utm_content=__CID__' },
            ]}
          />
        </details>
      </section>

      <section aria-labelledby="results">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 id="results" className="mr-auto font-semibold">
            Where customers come from
          </h2>
          <nav aria-label="Period" className="flex rounded-lg bg-zinc-100 p-1 text-sm">
            {PERIODS.map((p) => (
              <Link key={p} href={`/app/website/tag?d=${p}`} aria-current={p === days ? 'page' : undefined} className={`rounded-md px-3 py-1 font-medium ${p === days ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>
                {p} days
              </Link>
            ))}
          </nav>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Visits', n(t.visits)],
            ['People', n(t.visitors)],
            ['From ads', n(t.fromAds)],
            ['Leads', n(t.leads)],
            ['Sales', t.purchases ? `${n(t.purchases)} · ${money(t.revenue, cur)}` : '0'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-zinc-200 bg-white p-3">
              <dt className="text-xs text-zinc-500">{k}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {report.sources.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">No visits in this period yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[720px] text-sm" aria-label="Sources">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="p-2.5">Source / medium · campaign</th>
                  <th className="p-2.5 text-right">Visits</th>
                  <th className="p-2.5 text-right">Leads</th>
                  <th className="p-2.5 text-right">Sales</th>
                  <th className="p-2.5 text-right">Revenue</th>
                  <th className="p-2.5 text-right">Spend</th>
                  <th className="p-2.5 text-right">Cost / result</th>
                  <th className="p-2.5 text-right">Return</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {report.sources.map((r) => {
                  const results = r.leads + r.purchases
                  return (
                    <tr key={r.key}>
                      <td className="p-2.5">
                        <span className="font-medium">
                          {r.source} / {r.medium}
                        </span>
                        {r.paid && <span className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">ad</span>}
                        {(r.adCampaign || r.campaign) && <span className="block text-xs text-zinc-500">{r.adCampaign ?? r.campaign}</span>}
                      </td>
                      <td className="p-2.5 text-right tabular-nums">{n(r.visits)}</td>
                      <td className="p-2.5 text-right tabular-nums">{n(r.leads)}</td>
                      <td className="p-2.5 text-right tabular-nums">{n(r.purchases)}</td>
                      <td className="p-2.5 text-right tabular-nums">{r.revenue ? money(r.revenue, cur) : '—'}</td>
                      <td className="p-2.5 text-right tabular-nums">{r.spend != null ? money(r.spend, r.currency) : '—'}</td>
                      <td className="p-2.5 text-right tabular-nums">{r.spend != null && results ? money(r.spend / results, r.currency) : '—'}</td>
                      <td className="p-2.5 text-right tabular-nums">{r.spend && r.revenue ? `${(r.revenue / r.spend).toFixed(1)}×` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          A sale or lead counts for the visit it happened in — or, if the person typed your address, for their last visit from a source in the 30 days before.
          Test-shop visits are not counted.
        </p>
      </section>

      <section className={card} aria-labelledby="journeys">
        <h2 id="journeys" className="flex items-center gap-2 font-semibold">
          <MousePointerClick size={17} /> Paths to a lead or sale
        </h2>
        {report.journeys.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">When someone becomes a lead or buys, their path shows up here: which ad they came from, the pages they read and what they did.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100" aria-label="Journeys">
            {report.journeys.map((j) => (
              <li key={j.visitorId} className="py-2">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{j.who}</span>
                    {j.converted.map((c) => (
                      <span key={c} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                        {c}
                      </span>
                    ))}
                    {j.revenue > 0 && <span className="text-xs text-zinc-500">{money(j.revenue, cur)}</span>}
                  </summary>
                  <ol className="mt-2 ml-1 space-y-1.5 border-l border-zinc-200 pl-4 text-sm">
                    {j.steps.map((s, i) => (
                      <li key={i} className={s.kind === 'visit' ? 'pt-1 font-medium' : s.kind === 'event' ? 'text-emerald-700' : 'text-zinc-600'}>
                        <span className="mr-2 text-xs text-zinc-400 tabular-nums">
                          <LocalTime iso={s.at} options={SHORT} />
                        </span>
                        {s.kind === 'visit' ? `Came from ${s.text}` : s.text}
                        {s.detail && <span className="ml-1.5 text-xs text-zinc-400">{s.detail}</span>}
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} aria-labelledby="live">
        <div className="flex items-center gap-2">
          <h2 id="live" className="mr-auto font-semibold">
            Latest events
          </h2>
          <LiveRefresh />
        </div>
        {live.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Nothing yet. Open your website (or the demo shop) — events appear here within seconds.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" aria-label="Latest events">
              <tbody className="divide-y divide-zinc-100">
                {live.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 pr-3 text-xs whitespace-nowrap text-zinc-400">
                      <LocalTime iso={e.at} options={SHORT} />
                    </td>
                    <td className="py-2 pr-3 font-medium">
                      {e.name}
                      {e.test && <span className="ml-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-normal text-zinc-500">test</span>}
                    </td>
                    <td className="max-w-[240px] truncate py-2 pr-3 text-zinc-600">{e.page || '—'}</td>
                    <td className="py-2 pr-3 text-zinc-600">{e.from}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{e.value ?? ''}</td>
                    <td className="py-2 text-right text-xs text-zinc-500">{e.capi === 'sent' ? 'sent to Meta' : e.capi === 'pending' ? 'to Meta…' : e.capi === 'failed' ? 'Meta refused' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card} aria-labelledby="settings">
        <h2 id="settings" className="mb-4 font-semibold">
          Settings
        </h2>
        {site.capiError && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Meta refused the last conversions: {site.capiError}
          </p>
        )}
        <TagSettingsForm
          canManage={canManage}
          hasToken={Boolean(site.capiTokenEnc)}
          pixels={pixels}
          initial={{
            domains: site.domains.join(', '),
            consentRequired: site.consentRequired,
            autoForms: site.autoForms,
            capi: site.capi,
            pixelId: site.pixelId ?? pixels[0] ?? '',
            capiEvents: site.capiEvents,
            pixelMirror: site.pixelMirror,
          }}
        />
        <div className="mt-6 border-t border-zinc-100 pt-5">
          <h3 className="text-sm font-semibold">Site secret</h3>
          <p className="mt-1 mb-3 text-sm text-zinc-500">
            For developers: signs logged-in customers for the chat, server-side events and the requests Loudpilot sends to your data endpoint. Keep it on your
            server — never in the page.{' '}
            <Link href="/docs/website#secret" className="inline-flex items-center gap-0.5 text-indigo-600">
              How it is used <ExternalLink size={12} />
            </Link>
          </p>
          <SecretBox canManage={canManage} />
          <p className="mt-3 text-xs text-zinc-500">
            Site key (public): <code className="rounded bg-zinc-100 px-1">{site.key}</code>
          </p>
        </div>
      </section>
    </div>
  )
}
