'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { usePrices } from '@/components/Prices'
import { checkGeoVisibility } from './actions'

export function GeoButton({ again }: { again: boolean }) {
  const router = useRouter()
  const P = usePrices()
  const [pending, start] = useTransition()
  const [language, setLanguage] = useState('English')
  const [err, setErr] = useState<string>()
  return (
    <span className="flex flex-wrap items-center gap-2">
      <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Question language" className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm">
        {['English', 'Georgian', 'Russian'].map((l) => (
          <option key={l}>{l}</option>
        ))}
      </select>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await checkGeoVisibility(language)
            setErr(r.error)
            router.refresh()
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {pending ? 'Asking AI search… (about a minute)' : `${again ? 'Ask again' : 'Ask AI search'} · ${P.aiSearch} credits`}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  )
}
