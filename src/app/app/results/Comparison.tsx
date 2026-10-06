'use client'

import { useState, useTransition } from 'react'
import { Loader2, Scale, Sparkles } from 'lucide-react'
import { usePrices } from '@/components/Prices'
import type { ResultsExplanation } from '@/lib/ai'
import type { Comparison } from '@/lib/actuals'
import { explainComparison } from './actions'

const PILL = {
  better: 'bg-emerald-50 text-emerald-700',
  on: 'bg-sky-50 text-sky-700',
  worse: 'bg-red-50 text-red-700',
  none: 'bg-zinc-100 text-zinc-500',
} as const
const LABEL = { better: 'Better', on: 'On plan', worse: 'Behind', none: '—' } as const

// "What we wanted vs what we got", with an AI reading of the gaps.
export function ComparisonCard({ kind, id, data }: { kind: 'plan' | 'campaign'; id: string; data: Comparison }) {
  const P = usePrices()
  const [explanation, setExplanation] = useState<ResultsExplanation>()
  const [language, setLanguage] = useState('English')
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  return (
    <section aria-label="Plan vs actual" className="rounded-2xl border border-zinc-200 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Scale size={17} className="text-zinc-500" /> Planned vs actual
        </h2>
        <span className="text-xs text-zinc-500">
          {data.from} – {data.to}
          {data.ended ? '' : ' · still running'}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Explanation language" className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs">
            {['English', 'Georgian', 'Russian'].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <button
            onClick={() =>
              start(async () => {
                setError(undefined)
                const res = await explainComparison(kind, id, language)
                if (res.error) return setError(res.error)
                setExplanation(res.explanation)
              })
            }
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Explain · {P.summary} credit
          </button>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="py-1.5 font-medium" />
              <th className="py-1.5 font-medium">Planned</th>
              <th className="py-1.5 font-medium">Actual</th>
              <th className="py-1.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {data.rows.map((r) => (
              <tr key={r.label}>
                <td className="py-2 pr-3">
                  {r.label}
                  {r.note && <span className="block text-xs text-zinc-500">{r.note}</span>}
                </td>
                <td className="py-2 pr-3 tabular-nums text-zinc-600">{r.planned}</td>
                <td className="py-2 pr-3 font-semibold tabular-nums">{r.actual}</td>
                <td className="py-2">{r.verdict !== 'none' && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PILL[r.verdict]}`}>{LABEL[r.verdict]}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {explanation && (
        <div className="mt-4 rounded-xl bg-indigo-50/60 p-4 text-sm ring-1 ring-indigo-100" aria-label="Explanation">
          <p className="font-semibold">{explanation.headline}</p>
          <p className="mt-2 text-xs font-semibold text-zinc-500">WHY</p>
          <ul className="list-disc pl-5 text-zinc-700">
            {explanation.why.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs font-semibold text-zinc-500">NEXT</p>
          <ul className="list-disc pl-5 text-zinc-700">
            {explanation.next.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
