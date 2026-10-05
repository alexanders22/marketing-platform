'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowLeft, FileText, Loader2, Zap } from 'lucide-react'
import { createAiBlog } from '../actions'
import { creditsLabel } from '@/lib/pricing'
import { usePrices } from '@/components/Prices'

const TONES = ['Professional', 'Friendly', 'Educational', 'Bold', 'Founder-led'] as const
const LENGTHS = [
  { v: 'Short', hint: '500–700 words' },
  { v: 'Medium', hint: '900–1,200 words' },
  { v: 'Long', hint: '1,500–2,000 words' },
] as const
const LANGS = ['English', 'Georgian', 'Russian'] as const

export function AiBlogForm({ credits }: { credits: number }) {
  const P = usePrices()
  const router = useRouter()
  const [topic, setTopic] = useState('')
  const [keywords, setKeywords] = useState('')
  const [tone, setTone] = useState<(typeof TONES)[number]>('Educational')
  const [length, setLength] = useState<(typeof LENGTHS)[number]['v']>('Medium')
  const [language, setLanguage] = useState<(typeof LANGS)[number]>('English')
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      setError(undefined)
      const res = await createAiBlog({ topic, keywords, tone, length, language })
      if (res.error) setError(res.error)
      else router.push(`/app/blog/${res.id}`)
    })

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/planner" className="inline-grid h-10 w-10 place-items-center rounded-lg bg-zinc-100 hover:bg-zinc-200" aria-label="Back">
        <ArrowLeft size={18} />
      </Link>
      <div className="mt-2 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-orange-50 text-orange-600">
          <FileText size={22} />
        </span>
        <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">New AI blog article</h1>
        <p className="mt-2 text-zinc-500">Give a topic — Loudpilot writes a structured, on-brand article you can edit and publish.</p>
      </div>

      <div className="mt-8 space-y-5">
        <label className="block">
          <span className="text-sm font-semibold">Topic</span>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. How to choose an apartment for a weekend in Tbilisi old town"
            className="mt-1.5 min-h-28 w-full resize-y rounded-xl border border-zinc-200 px-4 py-3 text-[15px] outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Keywords</span>
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="tbilisi apartments, old town, weekend trip"
            className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
          />
        </label>
        <Choice label="Tone" options={TONES.map((t) => ({ v: t }))} value={tone} onChange={setTone} />
        <Choice label="Length" options={LENGTHS.map((l) => ({ v: l.v, hint: l.hint }))} value={length} onChange={setLength} />
        <Choice label="Language" options={LANGS.map((l) => ({ v: l }))} value={language} onChange={setLanguage} />
      </div>

      {error && <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-8 flex items-center justify-between gap-3 border-t border-zinc-100 pt-5">
        <span className="inline-flex items-center gap-1 text-sm text-zinc-500">
          <Zap size={14} className="text-amber-500" /> {creditsLabel(P.blogArticle)} · {credits.toLocaleString()} left
        </span>
        <button
          onClick={submit}
          disabled={pending || topic.trim().length < 5}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          {pending && <Loader2 size={15} className="animate-spin" />}
          {pending ? 'Writing… up to a minute' : 'Write article'}
        </button>
      </div>
    </div>
  )
}

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { v: T; hint?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div>
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`rounded-lg border px-3 py-2 text-sm transition ${
              value === o.v ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:border-zinc-400'
            }`}
          >
            {o.v}
            {o.hint && <span className={`ml-1.5 text-xs ${value === o.v ? 'text-zinc-300' : 'text-zinc-400'}`}>{o.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
