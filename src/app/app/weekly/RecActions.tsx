'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, RefreshCw, X } from 'lucide-react'
import { applyRec, dismissRec, reviewNow } from './actions'

const APPLY: Record<string, string> = {
  post: 'Add to Planner',
  repeat: 'Add to Planner',
  goal: 'Watch this goal',
}

export function RecActions({ id, kind }: { id: string; kind: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  const [ref, setRef] = useState<string>()
  const run = (fn: () => Promise<{ error?: string; ref?: string }>) =>
    start(async () => {
      setError(undefined)
      const res = await fn()
      if (res.error) return setError(res.error)
      if (res.ref) setRef(res.ref)
      router.refresh()
    })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        onClick={() => run(() => applyRec(id))}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        <Check size={14} /> {APPLY[kind] ?? 'Mark as done'}
      </button>
      <button
        disabled={pending}
        onClick={() => run(() => dismissRec(id))}
        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-60"
        aria-label="Dismiss recommendation"
      >
        <X size={14} /> Not now
      </button>
      {ref && kind !== 'goal' && (
        <Link href={`/app/posts/${ref}`} className="text-sm font-medium text-indigo-600">
          Open the draft →
        </Link>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  )
}

export function ReviewNowButton({ first }: { first: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() =>
          start(async () => {
            setError(undefined)
            const res = await reviewNow()
            if (res.error) setError(res.error)
            router.refresh()
          })
        }
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${first ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'border border-zinc-200 hover:bg-zinc-50'}`}
      >
        <RefreshCw size={15} className={pending ? 'animate-spin' : ''} />
        {pending ? 'Reviewing the last 7 days…' : first ? 'Review the last 7 days' : 'Review now'}
      </button>
      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  )
}
