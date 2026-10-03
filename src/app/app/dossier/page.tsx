import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { AlertTriangle, Ban, Building2, CheckCircle2, Lightbulb, Megaphone, ScrollText, XCircle } from 'lucide-react'
import { SiFacebook, SiInstagram } from 'react-icons/si'
import { LocalTime } from '@/components/LocalTime'
import type { BrandAuditData, CompanyProfile } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import type { DossierStats } from '@/lib/dossier'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { RefreshButton } from './RefreshButton'

export const metadata: Metadata = { title: 'Dossier — Khma' }

function Card({ title, icon, children, className = '' }: { title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-zinc-200 p-5 ${className}`}>
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

// Relative performance: 1.0 = the account's average.
function Bars({ rows, label }: { rows: { key: string; posts: number; index: number | null }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.index ?? 0))
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{label}</p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[110px_1fr_70px] items-center gap-2 text-sm">
            <span className="truncate text-zinc-700">{r.key.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>
            <span className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <span
                className={`block h-full rounded-full ${r.posts < 3 ? 'bg-zinc-300' : (r.index ?? 0) >= 1.15 ? 'bg-emerald-500' : (r.index ?? 0) <= 0.85 ? 'bg-red-400' : 'bg-indigo-400'}`}
                style={{ width: `${Math.round(((r.index ?? 0) / max) * 100)}%` }}
              />
            </span>
            <span className="text-right text-xs text-zinc-500 tabular-nums">
              {r.index === null ? '—' : `${r.index.toFixed(2)}×`} · {r.posts}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const VERDICT = {
  works: 'bg-emerald-50 text-emerald-700',
  weak: 'bg-red-50 text-red-700',
  untested: 'bg-zinc-100 text-zinc-600',
}

export default async function DossierPage() {
  const { workspace, brand, role } = await requireContext()
  const [profileRow, auditRow, accounts, postCount] = await Promise.all([
    prisma.brandProfile.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.brandAudit.findFirst({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'desc' } }),
    prisma.socialAccount.findMany({ where: { workspaceId: workspace.id }, select: { network: true, name: true, historyAt: true } }),
    prisma.socialPost.count({ where: { workspaceId: workspace.id } }),
  ])
  const profile = profileRow?.data as CompanyProfile | undefined
  const audit = auditRow?.data as BrandAuditData | undefined
  const stats = auditRow?.stats as DossierStats | undefined
  const canEdit = role !== 'EDITOR'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Dossier</h1>
          <p className="text-sm text-zinc-500">
            What Khma knows about {workspace.name}: your website, every post and ad of the last 12 months, and what worked.
            Every post, campaign and plan Khma writes uses it.
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {postCount} posts read
            {auditRow && (
              <>
                {' '}
                · audited <LocalTime iso={auditRow.createdAt.toISOString()} options={{ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }} />
              </>
            )}
            {profileRow && ` · ${profileRow.sources.length} website pages`}
          </p>
        </div>
        {canEdit && <RefreshButton label={profile || audit ? 'Refresh' : 'Build the dossier'} />}
      </div>

      {!brand?.website && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Add your website in{' '}
          <Link href="/app/brand" className="font-medium underline">
            Brand
          </Link>{' '}
          so Khma can read what you sell.
        </p>
      )}
      {accounts.filter((a) => a.network !== 'META_ADS').length === 0 && (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          <Link href="/app/channels" className="font-medium text-zinc-900 underline">
            Connect Facebook and Instagram
          </Link>{' '}
          — Khma reads your last 12 months of posts and ads to learn what works for you.
        </p>
      )}

      {profile && (
        <Card title="The company" icon={<Building2 size={17} className="text-zinc-500" />}>
          <p className="text-[15px] text-zinc-800">{profile.summary}</p>
          {profile.industry && <p className="mt-1 text-sm text-zinc-500">{profile.industry}</p>}
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {profile.offerings.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">What they sell</p>
                <ul className="space-y-1.5 text-sm">
                  {profile.offerings.map((o) => (
                    <li key={o.name}>
                      <b className="font-medium">{o.name}</b>
                      {o.price && <span className="ml-1 text-zinc-500">· {o.price}</span>}
                      {o.description && <span className="block text-zinc-600">{o.description}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="space-y-4">
              {profile.audiences.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Who buys</p>
                  <ul className="space-y-1 text-sm">
                    {profile.audiences.map((a) => (
                      <li key={a.name}>
                        <b className="font-medium">{a.name}</b> — <span className="text-zinc-600">{a.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {profile.usp.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Why choose them</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-zinc-700">
                    {profile.usp.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                </div>
              )}
              {profile.locations.length > 0 && <p className="text-sm text-zinc-600">📍 {profile.locations.join(' · ')}</p>}
            </div>
          </div>
          {profile.gaps.length > 0 && (
            <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertTriangle size={14} /> Missing on your website — adding it helps ads convert
              </p>
              <ul className="list-disc pl-5">
                {profile.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {audit && stats ? (
        <>
          <Card title="Audit" icon={<ScrollText size={17} className="text-zinc-500" />}>
            <p className="text-[15px] text-zinc-800">{audit.summary}</p>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-emerald-700 uppercase">
                  <CheckCircle2 size={14} /> Works
                </p>
                <ul className="space-y-2 text-sm">
                  {audit.works.map((w) => (
                    <li key={w.insight}>
                      <span className="text-zinc-800">{w.insight}</span>
                      <span className="block text-xs text-zinc-500">{w.evidence}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-red-700 uppercase">
                  <XCircle size={14} /> Doesn&apos;t work
                </p>
                <ul className="space-y-2 text-sm">
                  {audit.doesnt.map((w) => (
                    <li key={w.insight}>
                      <span className="text-zinc-800">{w.insight}</span>
                      <span className="block text-xs text-zinc-500">{w.evidence}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              {[
                ['When', audit.bestTimes],
                ['Formats', audit.formats],
                ['How often', audit.frequency],
              ].map(([k, v]) =>
                v ? (
                  <div key={k} className="rounded-xl bg-zinc-50 p-3">
                    <p className="text-xs font-semibold text-zinc-500">{k}</p>
                    <p className="mt-0.5 text-zinc-800">{v}</p>
                  </div>
                ) : null,
              )}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {audit.topics.length > 0 && (
              <Card title="Topics">
                <ul className="divide-y divide-zinc-100">
                  {audit.topics.map((t) => (
                    <li key={t.name} className="flex gap-3 py-2 text-sm">
                      <span className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT[t.verdict]}`}>{t.verdict}</span>
                      <span>
                        <b className="font-medium">{t.name}</b>
                        <span className="block text-xs text-zinc-500">{t.evidence}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {stats.posts.total > 0 && (
              <Card title="Patterns">
                <p className="mb-3 text-xs text-zinc-500">Engagement vs your average (1.00×) · number of posts. Grey: fewer than 3 posts.</p>
                <div className="space-y-5">
                  <Bars rows={stats.posts.byFormat} label="Format" />
                  <Bars rows={stats.posts.byWeekday} label={`Day (${stats.timeZone})`} />
                  <Bars rows={stats.posts.byTime} label="Time of day" />
                  <Bars rows={stats.posts.byLength} label="Caption length" />
                </div>
              </Card>
            )}
          </div>

          {stats.posts.best.length > 0 && (
            <Card title="Best and worst posts">
              <div className="grid gap-5 md:grid-cols-2">
                {[
                  ['Best', stats.posts.best.slice(0, 5)],
                  ['Weakest', stats.posts.worst.slice(0, 5)],
                ].map(([label, list]) =>
                  (list as DossierStats['posts']['best']).length ? (
                    <div key={label as string}>
                      <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{label as string}</p>
                      <ul className="space-y-2">
                        {(list as DossierStats['posts']['best']).map((p, i) => (
                          <li key={i} className="rounded-xl border border-zinc-100 p-3 text-sm">
                            <p className="flex items-center gap-2 text-xs text-zinc-500">
                              {p.network === 'INSTAGRAM' ? <SiInstagram size={11} color="#E4405F" /> : <SiFacebook size={11} color="#1877F2" />}
                              {p.date} · {p.format.toLowerCase()} · <b className="text-zinc-800">{p.index}×</b> · {formatNumber(p.engagements)} engagements
                              {p.reach !== null && ` · reach ${formatNumber(p.reach)}`}
                            </p>
                            <p className="mt-1 line-clamp-2 text-zinc-700">{p.text || '(no text)'}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </div>
            </Card>
          )}

          {(audit.ads.length > 0 || stats.ads.bestCreatives.length > 0) && (
            <Card title="Ads" icon={<Megaphone size={17} className="text-zinc-500" />}>
              {audit.ads.length > 0 && (
                <ul className="mb-4 space-y-2 text-sm">
                  {audit.ads.map((a) => (
                    <li key={a.insight}>
                      <span className="text-zinc-800">{a.insight}</span>
                      <span className="block text-xs text-zinc-500">{a.evidence}</span>
                    </li>
                  ))}
                </ul>
              )}
              {stats.ads.bestCreatives.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-zinc-200">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Best ads</th>
                        <th className="px-3 py-2 text-right font-medium">Spend</th>
                        <th className="px-3 py-2 text-right font-medium">Results</th>
                        <th className="px-3 py-2 text-right font-medium">Cost / result</th>
                        <th className="px-3 py-2 text-right font-medium">CTR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {stats.ads.bestCreatives.map((a, i) => (
                        <tr key={i}>
                          <td className="max-w-[280px] px-3 py-2">
                            <span className="block truncate font-medium">{a.headline || a.ad}</span>
                            <span className="block truncate text-xs text-zinc-500">{a.text ?? a.campaign}</span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(a.spend ?? 0, a.currency)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{a.results}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{a.costPerResult === null ? '—' : formatMoney(a.costPerResult, a.currency)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatPercent(a.ctr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {audit.avoid.length > 0 && (
              <Card title="Never again" icon={<Ban size={17} className="text-red-500" />}>
                <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
                  {audit.avoid.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </Card>
            )}
            {audit.opportunities.length > 0 && (
              <Card title="Not tried yet" icon={<Lightbulb size={17} className="text-amber-500" />}>
                <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
                  {audit.opportunities.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-zinc-900 p-5 text-white">
            <p className="mr-auto">
              <b>Ready for a plan?</b> Tell Khma what you want to achieve — it builds the strategy from this dossier.
            </p>
            <Link href="/app/strategy/new" className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
              Ask the strategist
            </Link>
          </div>
        </>
      ) : (
        !profile && (
          <section className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500">
            No dossier yet. {canEdit ? 'Build it — Khma reads your website and connected accounts.' : 'An owner or admin can build it.'}
          </section>
        )
      )}
    </div>
  )
}
