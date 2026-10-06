'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'

// "Run the check" for a website audit; shows the action's error, if any.
export function RunButton({ action, label, busy }: { action: () => Promise<{ error?: string }>; label: string; busy: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string>()
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await action()
            setErr(r.error)
            router.refresh()
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        <RefreshCw size={15} className={pending ? 'animate-spin' : ''} /> {pending ? busy : label}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  )
}
