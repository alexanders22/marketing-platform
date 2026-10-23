'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { refreshLeaderboard } from './actions'

export function RefreshBoard({ label }: { label: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await refreshLeaderboard()
            setError(r.error)
            router.refresh()
          })
        }
        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-60"
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {label}
      </button>
    </span>
  )
}
