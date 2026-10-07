'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { usePrices } from '@/components/Prices'
import { disconnectSearchConsole, pickSearchSite, planSeo } from './actions'
import { confirmDialog } from '@/components/ui/Dialog'

export function SitePicker({ sites, current }: { sites: string[]; current: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <span className="flex items-center gap-2">
      <select
        aria-label="Search Console site"
        disabled={pending}
        value={current}
        onChange={(e) =>
          start(async () => {
            await pickSearchSite(e.target.value)
            router.refresh()
          })
        }
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
      >
        {sites.map((s) => (
          <option key={s} value={s}>
            {s.replace(/^sc-domain:/, '')}
          </option>
        ))}
      </select>
      <button
        disabled={pending}
        onClick={async () =>
          (await confirmDialog('Disconnect Google Search Console?', { confirm: 'Disconnect', danger: true })) &&
          start(async () => {
            await disconnectSearchConsole()
            router.refresh()
          })
        }
        className="text-xs text-zinc-500 hover:text-red-600 hover:underline"
      >
        Disconnect
      </button>
    </span>
  )
}

export function SeoPlanButton({ again }: { again: boolean }) {
  const router = useRouter()
  const P = usePrices()
  const [pending, start] = useTransition()
  const [language, setLanguage] = useState('English')
  const [err, setErr] = useState<string>()
  return (
    <span className="flex flex-wrap items-center gap-2">
      <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Plan language" className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm">
        {['English', 'Georgian', 'Russian'].map((l) => (
          <option key={l}>{l}</option>
        ))}
      </select>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await planSeo(language)
            setErr(r.error)
            router.refresh()
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {again ? 'Rewrite the plan' : 'Write the action plan'} · {P.seoAdvice} credits
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  )
}
