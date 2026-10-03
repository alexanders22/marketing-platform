'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { refreshDossierNow } from './actions'

export function RefreshButton({ label = 'Refresh' }: { label?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() =>
          start(async () => {
            setError(undefined)
            const res = await refreshDossierNow()
            if (res.error) setError(res.error)
            router.refresh()
          })
        }
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        <RefreshCw size={15} className={pending ? 'animate-spin' : ''} />
        {pending ? 'Reading your website and posts… about a minute' : label}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
