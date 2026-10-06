import type { Metadata } from 'next'
import { Bot, Check, X } from 'lucide-react'
import { requireContext } from '@/lib/context'
import type { GeoReport } from '@/lib/geo'
import { prisma } from '@/lib/prisma'
import { checkGeoReadiness } from '../actions'
import { Checks } from '../Checks'
import { GeoButton } from '../GeoButton'
import { RunButton } from '../RunButton'

export const metadata: Metadata = { title: 'AI search — Loudpilot' }

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export default async function AiSearchPage() {
  const { workspace } = await requireContext()
  const last = await prisma.websiteAudit.findFirst({ where: { workspaceId: workspace.id, kind: 'GEO' }, orderBy: { createdAt: 'desc' } })
  const r = last?.result as GeoReport | undefined
  const v = r?.visibility
  return (
    <div className="space-y-6">
      <div className="mr-auto max-w-2xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Bot size={22} /> AI search
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          More and more customers ask ChatGPT, Gemini or Google&rsquo;s AI Mode instead of searching. Would they recommend {workspace.name}? Loudpilot asks
          them your customers&rsquo; questions and checks that your site is easy for AI to read.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-sm font-semibold">Visibility in AI answers</h2>
          <GeoButton again={!!v} />
        </div>
        {!v ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">
            Not checked yet. Loudpilot writes 6 questions a customer would ask (from your profile and real Google searches), gets the answers AI search gives
            with live Google results, and shows whether you are named, who is named instead and which websites the answers trust.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="text-xs text-zinc-500">Named in</p>
                <p className={`text-4xl font-bold tabular-nums ${v.score >= 50 ? 'text-emerald-600' : v.score > 0 ? 'text-amber-500' : 'text-red-600'}`} aria-label="AI visibility">
                  {v.score}%
                </p>
                <p className="text-xs text-zinc-500">of {v.questions.length} answers</p>
              </div>
              <p className="text-xs text-zinc-500">
                Asked {when(v.at)} in {v.language}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {v.rivals.length > 0 && (
                <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
                  <p className="mb-2 font-semibold">Recommended instead</p>
                  <ul className="space-y-1" aria-label="Recommended instead">
                    {v.rivals.map((x) => (
                      <li key={x.name} className="flex justify-between gap-2">
                        <span className="truncate">{x.name}</span>
                        <span className="text-zinc-500">{x.count}×</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {v.sources.length > 0 && (
                <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
                  <p className="mb-1 font-semibold">Websites the answers rely on</p>
                  <p className="mb-2 text-xs text-zinc-500">Be present and well reviewed on these: directories, maps, review and media sites.</p>
                  <ul className="space-y-1" aria-label="Sources">
                    {v.sources.map((x) => (
                      <li key={x.domain} className="flex justify-between gap-2">
                        <span className="truncate">{x.domain}</span>
                        <span className="text-zinc-500">{x.count}×</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <ul className="space-y-2" aria-label="Questions">
              {v.questions.map((a) => (
                <li key={a.question} className="rounded-xl border border-zinc-200 bg-white text-sm">
                  <details>
                    <summary className="flex cursor-pointer items-center gap-2 p-3">
                      {a.mentioned || a.cited ? <Check size={16} className="shrink-0 text-emerald-600" /> : <X size={16} className="shrink-0 text-red-500" />}
                      <span className="flex-1 font-medium">{a.question}</span>
                      <span className="text-xs text-zinc-500">{a.cited ? 'site cited' : a.mentioned ? 'named' : a.businesses.length ? `${a.businesses.length} others named` : 'not named'}</span>
                    </summary>
                    <div className="space-y-2 border-t border-zinc-100 p-3">
                      <p className="whitespace-pre-line text-zinc-700">{a.answer}</p>
                      {a.sources.length > 0 && <p className="text-xs text-zinc-500">Sources: {a.sources.map((s) => s.title).join(', ')}</p>}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-sm font-semibold">
            Ready for AI crawlers{r ? ` · ${r.readiness.score}/100` : ''}
          </h2>
          <RunButton action={checkGeoReadiness} label={r ? 'Check again' : 'Check the site'} busy="Checking…" />
        </div>
        {r ? (
          <>
            <p className="text-xs text-zinc-500">Checked {when(r.readiness.at)}</p>
            <Checks checks={r.readiness.checks} label="AI readiness checks" />
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">Free: robots.txt for AI crawlers, text without JavaScript, structured data, FAQ, contact details, llms.txt.</p>
        )}
      </section>
    </div>
  )
}
