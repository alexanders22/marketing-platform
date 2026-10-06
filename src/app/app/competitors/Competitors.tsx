'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ExternalLink, Loader2, Pencil, Plus, Search, Swords, Trash2, Trophy, TriangleAlert } from 'lucide-react'
import { SiFacebook, SiInstagram } from 'react-icons/si'
import { LocalTime } from '@/components/LocalTime'
import { usePrices } from '@/components/Prices'
import type { CompetitorReportData, FoundCompetitor } from '@/lib/ai'
import { addCompetitor, compareNow, deleteCompetitor, suggestCompetitors, updateCompetitor } from './actions'

type Rival = {
  id: string
  name: string
  website: string | null
  facebook: string | null
  instagram: string | null
  notes: string
  summary: string | null
  offerings: { name: string; price?: string }[]
  analyzedAt: string | null
  error: string | null
}

type Form = { name: string; website: string; facebook: string; instagram: string; notes: string }
const EMPTY: Form = { name: '', website: '', facebook: '', instagram: '', notes: '' }
const field = 'w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400'

// Facebook Ad Library search for a competitor: the ads they run right now.
const adLibrary = (name: string) => `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=${encodeURIComponent(name)}&search_type=keyword_unordered`

export function Competitors({ brand, competitors, report }: { brand: string; competitors: Rival[]; report: { data: CompetitorReportData; createdAt: string; language: string } | null }) {
  const P = usePrices()
  const router = useRouter()
  const [form, setForm] = useState<Form | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [found, setFound] = useState<FoundCompetitor[] | null>(null)
  const [language, setLanguage] = useState(report?.language ?? 'English')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()

  const run = (key: string, fn: () => Promise<{ error?: string } | void>) => {
    setBusy(key)
    setError(undefined)
    start(async () => {
      const res = await fn()
      if (res && 'error' in res && res.error) setError(res.error)
      setBusy(null)
      router.refresh()
    })
  }
  const unread = competitors.filter((c) => c.website && !c.analyzedAt).length
  const cost = unread * P.competitor + P.compare

  const save = () =>
    run('save', async () => {
      if (!form) return
      const res = editing ? await updateCompetitor(editing, form) : await addCompetitor(form)
      if (res.error) return res
      setForm(null)
      setEditing(null)
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto max-w-2xl">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Swords size={22} /> Competitors
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Who else your customers look at. Loudpilot reads their websites, compares them with {brand} and tells you where you win, what you
            miss and what to do about it. Every plan and post then uses it.
          </p>
        </div>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Report language" className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm">
          {['English', 'Georgian', 'Russian'].map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <button
          onClick={() => run('compare', () => compareNow({ language }))}
          disabled={busy !== null || competitors.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy === 'compare' ? <Loader2 size={15} className="animate-spin" /> : <Swords size={15} />}
          {busy === 'compare' ? 'Reading and comparing…' : `${report ? 'Compare again' : 'Compare'} · ${cost} credit${cost === 1 ? '' : 's'}`}
        </button>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">
            Your competitors <span className="font-normal text-zinc-500">· {competitors.length} of 10</span>
          </h2>
          <button
            onClick={() =>
              run('find', async () => {
                const res = await suggestCompetitors()
                if (res.error) return res
                setFound(res.found ?? [])
              })
            }
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            {busy === 'find' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Find with Google · {P.competitorSearch} credit
          </button>
          <button
            onClick={() => (setEditing(null), setForm(EMPTY))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            <Plus size={14} /> Add competitor
          </button>
        </div>

        {found && (
          <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200" aria-label="Found competitors" role="region">
            <p className="text-sm font-semibold">Found on Google — add the ones you really compete with</p>
            {found.length === 0 && <p className="mt-1 text-sm text-zinc-600">Nothing new found. Add competitors by hand.</p>}
            <ul className="mt-2 space-y-2">
              {found.map((f) => (
                <li key={f.website} className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 text-sm ring-1 ring-amber-100">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{f.name}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {f.website} · {f.why}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      run(`add-${f.website}`, async () => {
                        const res = await addCompetitor({ name: f.name, website: f.website })
                        if (!res.error) setFound((cur) => cur?.filter((x) => x.website !== f.website) ?? null)
                        return res
                      })
                    }
                    disabled={busy !== null}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => setFound(null)} className="mt-2 text-xs text-zinc-500 underline">
              Close
            </button>
          </div>
        )}

        {form && (
          <div className="space-y-3 rounded-xl border border-zinc-200 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`mt-1 ${field}`} placeholder="Competitor name" />
              </label>
              <label className="text-sm font-medium">
                Website
                <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className={`mt-1 ${field}`} placeholder="competitor.ge" />
              </label>
              <label className="text-sm font-medium">
                Facebook page
                <input value={form.facebook} onChange={(e) => setForm({ ...form, facebook: e.target.value })} className={`mt-1 ${field}`} placeholder="facebook.com/…" />
              </label>
              <label className="text-sm font-medium">
                Instagram
                <input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className={`mt-1 ${field}`} placeholder="@handle" />
              </label>
            </div>
            <label className="block text-sm font-medium">
              What you know about them
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={`mt-1 min-h-20 ${field}`}
                placeholder="Prices, offers, what customers say, ads you saw…"
              />
            </label>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy !== null || !form.name.trim()} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy === 'save' ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => (setForm(null), setEditing(null))} className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
                Cancel
              </button>
            </div>
          </div>
        )}

        {competitors.length === 0 && !form ? (
          <div className="rounded-xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-500">
            No competitors yet — find them with Google or add the ones you know.
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2" aria-label="Competitors">
            {competitors.map((c) => (
              <li key={c.id} className="rounded-xl border border-zinc-200 p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.name}</p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                      {c.website && (
                        <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-zinc-900">
                          {c.website.replace(/^https?:\/\//, '')} <ExternalLink size={11} />
                        </a>
                      )}
                      {c.facebook && <SiFacebook size={12} color="#1877F2" title={c.facebook} />}
                      {c.instagram && <SiInstagram size={12} color="#E4405F" title={c.instagram} />}
                      <a href={adLibrary(c.name)} target="_blank" rel="noreferrer" className="hover:text-zinc-900">
                        Their ads ↗
                      </a>
                    </p>
                  </div>
                  <button
                    onClick={() => (setEditing(c.id), setForm({ name: c.name, website: c.website ?? '', facebook: c.facebook ?? '', instagram: c.instagram ?? '', notes: c.notes }))}
                    aria-label={`Edit ${c.name}`}
                    className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => confirm(`Remove ${c.name}?`) && run(`del-${c.id}`, () => deleteCompetitor(c.id))}
                    aria-label={`Remove ${c.name}`}
                    className="rounded-md p-1 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {c.summary ? (
                  <p className="mt-2 line-clamp-3 text-sm text-zinc-700">{c.summary}</p>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500">{c.website ? 'Website not read yet — it is read on the next comparison.' : 'No website — compared from your notes.'}</p>
                )}
                {c.offerings.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {c.offerings.map((o) => (
                      <li key={o.name} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                        {o.name}
                        {o.price && <b className="ml-1 font-semibold">{o.price}</b>}
                      </li>
                    ))}
                  </ul>
                )}
                {c.error && <p className="mt-2 text-xs text-amber-700">Website could not be read: {c.error}</p>}
                {c.notes && <p className="mt-2 text-xs text-zinc-500 italic">“{c.notes.slice(0, 160)}”</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {report && <Report report={report} brand={brand} />}
    </div>
  )
}

function Report({ report, brand }: { report: { data: CompetitorReportData; createdAt: string }; brand: string }) {
  const r = report.data
  const names = r.table[0]?.them.map((t) => t.name) ?? []
  return (
    <section aria-label="Comparison" className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold">How you compare</h2>
        <span className="text-xs text-zinc-500">
          <LocalTime iso={report.createdAt} options={{ day: 'numeric', month: 'short', year: 'numeric' }} />
        </span>
      </div>
      <p className="text-sm text-zinc-700">{r.summary}</p>
      {r.positioning && (
        <p className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900 ring-1 ring-indigo-200">
          <b>Position to own:</b> {r.positioning}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium" />
              <th className="px-3 py-2 font-semibold text-zinc-900">{brand}</th>
              {names.map((n) => (
                <th key={n} className="px-3 py-2 font-medium">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {r.table.map((row) => (
              <tr key={row.dimension} className="align-top">
                <th className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-zinc-500">{row.dimension}</th>
                <td className="bg-indigo-50/40 px-3 py-2.5">{row.us}</td>
                {row.them.map((t, i) => (
                  <td key={i} className="px-3 py-2.5 text-zinc-700">
                    {t.value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
            <Trophy size={15} /> Where you win
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
            {r.wins.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <TriangleAlert size={15} /> Gaps to close
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
            {r.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      </div>

      {r.actions.length > 0 && (
        <div>
          <p className="text-xs font-semibold tracking-wide text-zinc-500">WHAT TO DO</p>
          <ul className="mt-2 space-y-2">
            {r.actions.map((a) => (
              <li key={a.title} className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="mt-0.5 text-sm text-zinc-600">{a.why}</p>
                </div>
                {(a.kind === 'post' || a.kind === 'offer') && (
                  <Link href={`/app/create?prompt=${encodeURIComponent(`${a.title}. ${a.why}`)}`} className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-center text-sm font-semibold text-white">
                    Write a post
                  </Link>
                )}
                {(a.kind === 'campaign' || a.kind === 'ads') && (
                  <Link
                    href={`/app/campaigns/new?kind=social&name=${encodeURIComponent(a.title.slice(0, 80))}&brief=${encodeURIComponent(a.why)}`}
                    className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-center text-sm font-semibold text-white"
                  >
                    Plan a campaign
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.perCompetitor.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {r.perCompetitor.map((c) => (
            <div key={c.name} className="rounded-xl border border-zinc-200 p-4 text-sm">
              <p className="font-semibold">{c.name}</p>
              <p className="mt-2 text-xs font-semibold text-emerald-700">Strong</p>
              <ul className="list-disc pl-5 text-zinc-700">
                {c.strengths.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs font-semibold text-red-700">Weak</p>
              <ul className="list-disc pl-5 text-zinc-700">
                {c.weaknesses.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
