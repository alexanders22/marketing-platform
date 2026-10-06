'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { BookOpen, Check, FileUp, Loader2, Printer, RotateCcw, Sparkles, Wand2 } from 'lucide-react'
import { usePrices } from '@/components/Prices'
import type { BrandbookData } from '@/lib/ai'
import { applyBrandbook, chooseDirection, deleteBrandbook, designDirections, uploadBrandbook } from './actions'

const TRAITS = ['Trustworthy', 'Premium', 'Friendly', 'Bold', 'Playful', 'Calm', 'Modern', 'Traditional', 'Expert', 'Caring', 'Energetic', 'Minimal']

export function BrandbookView({
  brand,
  logoUrl,
  audience,
  book,
}: {
  brand: string
  logoUrl: string | null
  audience: string
  book: { data: BrandbookData; source: string; updatedAt: string } | null
}) {
  const P = usePrices()
  const router = useRouter()
  const [mode, setMode] = useState<'upload' | 'create' | null>(null)
  const [error, setError] = useState<string>()
  const [ok, setOk] = useState<string>()
  const [pending, start] = useTransition()
  const file = useRef<HTMLInputElement>(null)
  const [traits, setTraits] = useState<string[]>([])
  const [who, setWho] = useState(audience)
  const [avoid, setAvoid] = useState('')
  const [colors, setColors] = useState('')
  const [language, setLanguage] = useState('English')
  const [directions, setDirections] = useState<BrandbookData[] | null>(null)

  const upload = (files: FileList | null) =>
    start(async () => {
      if (!files?.length) return
      setError(undefined)
      const f = new FormData()
      for (const x of Array.from(files)) f.append('files', x)
      const res = await uploadBrandbook(f)
      if (res.error) return setError(res.error)
      setMode(null)
      setOk('Brandbook read. Check it below, then apply it to your brand kit.')
      router.refresh()
    })

  if (book && !mode && !directions) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <h1 className="mr-auto flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BookOpen size={22} /> Brandbook
          </h1>
          <button
            onClick={() =>
              start(async () => {
                setError(undefined)
                const res = await applyBrandbook()
                if (res.error) return setError(res.error)
                setOk('Applied — colours, fonts and voice are in your brand kit; posts, designs and videos follow them.')
                router.refresh()
              })
            }
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            <Check size={15} /> Apply to brand kit
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50">
            <Printer size={15} /> Print / PDF
          </button>
          <button
            onClick={() => confirm('Replace the brandbook? The current one is removed.') && start(async () => (await deleteBrandbook(), router.refresh()))}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            <RotateCcw size={15} /> Start over
          </button>
        </div>
        {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">{ok}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">{error}</p>}
        <p className="text-xs text-zinc-500 print:hidden">{book.source === 'UPLOAD' ? 'Read from your brandbook.' : 'Created with Loudpilot.'}</p>
        <Book data={book.data} brand={brand} logoUrl={logoUrl} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BookOpen size={22} /> Brandbook
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          The rules of your brand — colours, fonts, voice, imagery. Loudpilot follows them in every post, design and video. Upload yours, or
          create one in a few minutes.
        </p>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!directions && (
        <div className="grid gap-3 md:grid-cols-2">
          <button
            onClick={() => (setMode('upload'), file.current?.click())}
            disabled={pending}
            className={`rounded-2xl border p-5 text-left transition hover:border-zinc-400 ${mode === 'upload' ? 'border-zinc-900' : 'border-zinc-200'}`}
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100">
              {pending && mode === 'upload' ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}
            </span>
            <p className="mt-3 font-semibold">{pending && mode === 'upload' ? 'Reading your brandbook…' : 'I have a brandbook'}</p>
            <p className="text-sm text-zinc-500">Upload the PDF or images of its pages · {P.brandbookRead} credits</p>
          </button>
          <button
            onClick={() => setMode('create')}
            className={`rounded-2xl border p-5 text-left transition hover:border-zinc-400 ${mode === 'create' ? 'border-zinc-900' : 'border-zinc-200'}`}
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
              <Wand2 size={18} />
            </span>
            <p className="mt-3 font-semibold">Create one with AI</p>
            <p className="text-sm text-zinc-500">A few questions → three directions to choose from · {P.brandbookDesign} credits</p>
          </button>
          <input ref={file} type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" aria-label="Brandbook files" onChange={(e) => upload(e.target.files)} />
        </div>
      )}

      {mode === 'create' && !directions && (
        <div className="space-y-4 rounded-2xl border border-zinc-200 p-5">
          <div>
            <p className="text-sm font-medium">Your brand in three words</p>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Personality">
              {TRAITS.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={traits.includes(t)}
                  onClick={() => setTraits((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < 3 ? [...cur, t] : cur))}
                  className={`rounded-full px-3 py-1.5 text-sm ring-1 ${traits.includes(t) ? 'bg-zinc-900 text-white ring-zinc-900' : 'ring-zinc-200 hover:bg-zinc-50'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-sm font-medium">
            Who are your customers?
            <textarea value={who} onChange={(e) => setWho(e.target.value)} className="mt-1 min-h-16 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" placeholder="e.g. young families in Tbilisi buying their first apartment" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Colours you like or already use
              <input value={colors} onChange={(e) => setColors(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" placeholder="e.g. deep green and gold, or #0F4C3A" />
            </label>
            <label className="block text-sm font-medium">
              What to avoid
              <input value={avoid} onChange={(e) => setAvoid(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" placeholder="e.g. childish look, slang" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Brandbook language" className="rounded-lg border border-zinc-200 px-2 py-2 text-sm">
              {['English', 'Georgian', 'Russian'].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <button
              onClick={() =>
                start(async () => {
                  setError(undefined)
                  const res = await designDirections({ personality: traits, audience: who, avoid, colors, language })
                  if (res.error || !res.directions) return setError(res.error)
                  setDirections(res.directions)
                })
              }
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {pending ? 'Designing three directions…' : `Create three directions · ${P.brandbookDesign} credits`}
            </button>
          </div>
        </div>
      )}

      {directions && (
        <section aria-label="Directions" className="space-y-3">
          <h2 className="font-semibold">Pick a direction</h2>
          <div className="grid gap-3 lg:grid-cols-3">
            {directions.map((d, i) => (
              <div key={i} className="flex flex-col rounded-2xl border border-zinc-200 p-4">
                <div className="flex h-16 overflow-hidden rounded-xl">
                  {d.colors.map((c) => (
                    <span key={c.hex} className="flex-1" style={{ background: c.hex }} title={`${c.name} ${c.hex}`} />
                  ))}
                </div>
                <p className="mt-3 text-lg font-semibold" style={{ fontFamily: d.fonts.heading }}>
                  {d.name}
                </p>
                <p className="text-xs text-zinc-500">
                  {d.personality.join(' · ')} · {d.fonts.heading} / {d.fonts.body}
                </p>
                <p className="mt-2 text-sm text-zinc-700" style={{ fontFamily: d.fonts.body }}>
                  {d.summary}
                </p>
                <p className="mt-2 text-sm text-zinc-600 italic">“{d.taglines[0]}”</p>
                <p className="mt-2 text-xs text-zinc-500">Voice: {d.voice.tone}</p>
                <button
                  onClick={() =>
                    start(async () => {
                      const res = await chooseDirection(d)
                      if (res.error) return setError(res.error)
                      setDirections(null)
                      setMode(null)
                      setOk('Saved and applied to your brand kit.')
                      router.refresh()
                    })
                  }
                  disabled={pending}
                  className="mt-auto rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                  style={{ marginTop: 16 }}
                >
                  Use “{d.name}”
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p>}
    </div>
  )
}

// The brandbook as a document (prints as a PDF).
function H({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">{children}</h2>
}

function Book({ data: b, brand, logoUrl }: { data: BrandbookData; brand: string; logoUrl: string | null }) {
  return (
    <article className="space-y-8 rounded-2xl border border-zinc-200 p-6 sm:p-10 print:border-0 print:p-0" aria-label="Brandbook">
      <header className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoUrl && <img src={logoUrl} alt="" className="h-14 w-14 rounded-xl object-contain ring-1 ring-zinc-200" />}
        <div>
          <p className="text-3xl font-semibold tracking-tight" style={{ fontFamily: b.fonts.heading || undefined }}>
            {brand}
          </p>
          <p className="text-sm text-zinc-500">Brandbook{b.name ? ` · ${b.name}` : ''}</p>
        </div>
      </header>
      {(b.summary || b.mission) && (
        <section className="space-y-2">
          <H>Who we are</H>
          {b.summary && <p className="text-zinc-800">{b.summary}</p>}
          {b.mission && <p className="text-zinc-600">Mission: {b.mission}</p>}
          {b.values.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {b.values.map((v) => (
                <li key={v} className="rounded-full bg-zinc-100 px-3 py-1 text-sm">
                  {v}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {b.colors.length > 0 && (
        <section className="space-y-3">
          <H>Colours</H>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {b.colors.map((c) => (
              <div key={c.hex} className="overflow-hidden rounded-xl ring-1 ring-zinc-200">
                <div className="h-20" style={{ background: c.hex }} />
                <div className="p-2 text-xs">
                  <p className="font-semibold">{c.name || c.role}</p>
                  <p className="font-mono text-zinc-500">{c.hex}</p>
                  {c.role && <p className="text-zinc-500">{c.role}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {(b.fonts.heading || b.fonts.body) && (
        <section className="space-y-2">
          <H>Typography</H>
          <p className="text-2xl font-semibold" style={{ fontFamily: b.fonts.heading }}>
            {b.fonts.heading} — headings
          </p>
          <p style={{ fontFamily: b.fonts.body }}>{b.fonts.body} — body text. The quick brown fox jumps over the lazy dog.</p>
        </section>
      )}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <H>Voice</H>
          {b.voice.tone && <p className="text-zinc-800">{b.voice.tone}</p>}
          {b.voice.do.length > 0 && <List title="Do" items={b.voice.do} tone="text-emerald-700" />}
          {b.voice.dont.length > 0 && <List title="Don't" items={b.voice.dont} tone="text-red-700" />}
          {b.voice.words.length > 0 && <p className="text-sm text-zinc-600">Signature words: {b.voice.words.join(', ')}</p>}
        </div>
        <div className="space-y-2">
          <H>Imagery</H>
          {b.imagery.style && <p className="text-zinc-800">{b.imagery.style}</p>}
          {b.imagery.do.length > 0 && <List title="Do" items={b.imagery.do} tone="text-emerald-700" />}
          {b.imagery.dont.length > 0 && <List title="Don't" items={b.imagery.dont} tone="text-red-700" />}
        </div>
      </section>
      {b.logo.length > 0 && (
        <section className="space-y-2">
          <H>Logo</H>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
            {b.logo.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}
      {(b.audience || b.taglines.length > 0) && (
        <section className="grid gap-6 md:grid-cols-2">
          {b.audience && (
            <div className="space-y-2">
              <H>Audience</H>
              <p className="text-zinc-800">{b.audience}</p>
            </div>
          )}
          {b.taglines.length > 0 && (
            <div className="space-y-2">
              <H>Taglines</H>
              <ul className="space-y-1 text-zinc-800 italic">
                {b.taglines.map((t) => (
                  <li key={t}>“{t}”</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </article>
  )
}

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className="text-sm">
      <p className={`font-semibold ${tone}`}>{title}</p>
      <ul className="list-disc pl-5 text-zinc-700">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  )
}
