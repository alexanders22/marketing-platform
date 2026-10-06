import type { Metadata } from 'next'
import { Search } from 'lucide-react'
import { requireContext } from '@/lib/context'
import { gaEnabled } from '@/lib/ga'
import { prisma } from '@/lib/prisma'
import type { ScRow, ScSite } from '@/lib/search-console'
import type { SeoReport } from '@/lib/seo'
import { checkSeo } from './actions'
import { Checks } from './Checks'
import { RunButton } from './RunButton'
import { SeoPlanButton, SitePicker } from './SeoControls'

export const metadata: Metadata = { title: 'SEO — Loudpilot' }

const ERRORS: Record<string, string> = {
  'sc-denied': 'Connection cancelled on Google.',
  'sc-state': 'The connection expired — please try again.',
  'sc-api': 'Google did not accept the connection. Please try again.',
  'sc-empty': 'This Google account has no verified site in Search Console. Add and verify your website at search.google.com/search-console first.',
  'ga-off': 'Google sign-in is not configured yet.',
  role: 'Only the owner or an admin can connect Google.',
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const n = (v: number) => Math.round(v).toLocaleString('en-US')
const delta = (now: number, before: number) => (before ? `${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 100)}%` : '')
const IMPACT = { high: 'bg-red-50 text-red-700', medium: 'bg-amber-50 text-amber-700', low: 'bg-zinc-100 text-zinc-600' }

function Queries({ rows, label }: { rows: ScRow[]; label: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-sm" aria-label={label}>
        <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
          <tr>
            <th className="p-2.5">{label}</th>
            <th className="p-2.5 text-right">Clicks</th>
            <th className="p-2.5 text-right">Shown</th>
            <th className="p-2.5 text-right">CTR</th>
            <th className="p-2.5 text-right">Position</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="max-w-xs truncate p-2.5">{r.key.replace(/^https?:\/\/[^/]+/, '') || '/'}</td>
              <td className="p-2.5 text-right tabular-nums">{n(r.clicks)}</td>
              <td className="p-2.5 text-right tabular-nums">{n(r.impressions)}</td>
              <td className="p-2.5 text-right tabular-nums">{pct(r.ctr)}</td>
              <td className="p-2.5 text-right tabular-nums">{r.position.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function SeoPage({ searchParams }: PageProps<'/app/website'>) {
  const { workspace, role } = await requireContext()
  const q = await searchParams
  const [last, sc] = await Promise.all([
    prisma.websiteAudit.findFirst({ where: { workspaceId: workspace.id, kind: 'SEO' }, orderBy: { createdAt: 'desc' } }),
    prisma.socialAccount.findFirst({ where: { workspaceId: workspace.id, network: 'SEARCH_CONSOLE' } }),
  ])
  const r = last?.result as SeoReport | undefined
  const error = typeof q.error === 'string' ? ERRORS[q.error] : undefined
  const sites = ((sc?.meta ?? {}) as { sites?: ScSite[] }).sites?.map((s) => s.url) ?? []
  const tone = !r ? '' : r.score >= 80 ? 'text-emerald-600' : r.score >= 50 ? 'text-amber-500' : 'text-red-600'
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto max-w-2xl">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Search size={22} /> SEO
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            How your website does in Google: what people search to find you, where you rank, what to fix on the pages — and an action plan.
          </p>
        </div>
        <RunButton action={checkSeo} label={r ? 'Check again' : 'Run the check'} busy="Checking the site…" />
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {q.connected === '1' && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Search Console connected. Run the check to read it.</p>}

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <span className="font-semibold">Google Search Console</span>
        {sc ? (
          <>
            <SitePicker sites={sites.length ? sites : [sc.externalId]} current={sc.externalId} />
            {sc.lastError && <span className="text-xs text-red-600">{sc.lastError}</span>}
          </>
        ) : (
          <>
            <span className="text-zinc-500">Shows real searches, clicks and positions. Without it, only the pages are checked.</span>
            {role !== 'EDITOR' && gaEnabled() && (
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a href="/auth/google-analytics?product=search-console" className="ml-auto rounded-lg border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-50">
                Connect Search Console
              </a>
            )}
          </>
        )}
      </section>

      {!r ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">No check yet. It reads your website from the Brand kit — the home page and up to 4 more pages.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-xs text-zinc-500">SEO score</p>
              <p className={`text-4xl font-bold tabular-nums ${tone}`} aria-label="SEO score">
                {r.score}
                <span className="text-lg text-zinc-400">/100</span>
              </p>
            </div>
            {r.search && (
              <dl className="flex flex-wrap gap-6 text-sm">
                {[
                  ['Clicks', n(r.search.totals.clicks), delta(r.search.totals.clicks, r.search.previous.clicks)],
                  ['Shown in Google', n(r.search.totals.impressions), delta(r.search.totals.impressions, r.search.previous.impressions)],
                  ['Click-through', pct(r.search.totals.ctr), ''],
                  ['Average position', r.search.totals.position.toFixed(1), ''],
                ].map(([k, v, d]) => (
                  <div key={k}>
                    <dt className="text-xs text-zinc-500">{k}</dt>
                    <dd className="text-xl font-semibold tabular-nums">
                      {v} {d && <span className={`text-xs ${d.startsWith('-') ? 'text-red-600' : 'text-emerald-600'}`}>{d}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="text-xs text-zinc-500">
              Checked {last!.createdAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · {r.pages.length} pages
              {r.search ? ` · searches ${r.search.from} – ${r.search.to}` : ''}
            </p>
          </div>
          {r.searchError && <p className="text-xs text-red-600">Search Console: {r.searchError}</p>}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="mr-auto text-sm font-semibold">Action plan</h2>
              <SeoPlanButton again={!!r.advice} />
            </div>
            {r.advice && (
              <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4" aria-label="SEO action plan">
                <p className="text-sm text-zinc-700">{r.advice.summary}</p>
                <ol className="space-y-2">
                  {r.advice.actions.map((a, i) => (
                    <li key={i} className="rounded-lg bg-white p-3 text-sm ring-1 ring-zinc-200">
                      <p className="flex items-center gap-2 font-semibold">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${IMPACT[a.impact]}`}>{a.impact}</span>
                        {a.title}
                      </p>
                      <p className="mt-1 text-zinc-600">{a.why}</p>
                      <p className="mt-1 whitespace-pre-line text-zinc-800">{a.how}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Checks</h2>
            <Checks checks={r.checks} label="SEO checks" />
          </section>

          {r.search && r.search.striking.length > 0 && (
            <section>
              <h2 className="mb-1 text-sm font-semibold">Almost on page one</h2>
              <p className="mb-2 text-xs text-zinc-500">Searches where you rank 4–15: a better page can move them into the top 3, where most clicks go.</p>
              <Queries rows={r.search.striking} label="Search" />
            </section>
          )}
          {r.search && r.search.queries.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Top searches</h2>
              <Queries rows={r.search.queries} label="Query" />
            </section>
          )}
          {r.search && r.search.pages.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Top pages</h2>
              <Queries rows={r.search.pages} label="Page" />
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold">Pages checked</h2>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="w-full text-sm" aria-label="Pages checked">
                <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                  <tr>
                    <th className="p-2.5">Page</th>
                    <th className="p-2.5">Title</th>
                    <th className="p-2.5 text-right">Words</th>
                    <th className="p-2.5 text-right">Load</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {r.pages.map((p) => (
                    <tr key={p.url}>
                      <td className="max-w-[12rem] truncate p-2.5">{p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</td>
                      <td className="max-w-md truncate p-2.5 text-zinc-600">{p.ok ? (p.title ?? '—') : <span className="text-red-600">{p.error}</span>}</td>
                      <td className="p-2.5 text-right tabular-nums">{p.ok ? n(p.words) : '—'}</td>
                      <td className="p-2.5 text-right tabular-nums">{p.ok ? `${p.ms} ms` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
