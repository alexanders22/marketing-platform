'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react'
import type { PerformanceSummary } from '@/lib/ai'
import { LocalTime } from '@/components/LocalTime'
import { generateSummary } from './actions'

export function SummaryCard({
  period,
  initial,
  createdAt,
}: {
  period: number
  initial: PerformanceSummary | null
  createdAt: string | null
}) {
  const router = useRouter()
  const [summary, setSummary] = useState(initial)
  const [at, setAt] = useState(createdAt)
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()

  const run = () =>
    start(async () => {
      setError(undefined)
      const res = await generateSummary(period)
      if (res.error) return setError(res.error)
      setSummary(res.summary!)
      setAt(new Date().toISOString())
      router.refresh()
    })

  return (
    <section className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-indigo-50/60 to-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-100 text-indigo-700">
          <Sparkles size={16} />
        </span>
        <h2 className="font-semibold">AI summary</h2>
        {at && (
          <span className="text-xs text-zinc-500">
            · <LocalTime iso={at} options={{ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }} />
          </span>
        )}
        <button
          onClick={run}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          <RefreshCw size={13} className={pending ? 'animate-spin' : ''} />
          {pending ? 'Reading your results…' : summary ? 'Refresh · 1 credit' : `Summarise last ${period} days · 1 credit`}
        </button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {summary ? (
        <div className="mt-4 space-y-4 text-sm">
          <p className="text-base font-medium text-zinc-900">{summary.headline}</p>
          <div className="grid gap-4 md:grid-cols-3">
            <List title="What worked" items={summary.wins} icon={<CheckCircle2 size={14} className="text-emerald-600" />} />
            <List title="Watch out" items={summary.concerns} icon={<AlertTriangle size={14} className="text-amber-600" />} />
            <List title="Do this week" items={summary.actions} icon={<ArrowRight size={14} className="text-indigo-600" />} />
          </div>
        </div>
      ) : (
        !error && (
          <p className="mt-3 text-sm text-zinc-600">
            Khma reads your ads and posts for this period and tells you what worked, what to watch and what to do next.
          </p>
        )
      )}
    </section>
  )
}

function List({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{title}</p>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-zinc-700">
            <span className="mt-0.5 shrink-0">{icon}</span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  )
}
