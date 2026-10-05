'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Compass, Sparkles } from 'lucide-react'
import { createPlan } from '../actions'
import { creditsLabel } from '@/lib/pricing'
import { usePrices } from '@/components/Prices'

const OBJECTIVES = [
  { id: 'SALES', label: 'More sales' },
  { id: 'LEADS', label: 'More leads' },
  { id: 'TRAFFIC', label: 'More site visits' },
  { id: 'AWARENESS', label: 'Be known' },
  { id: 'ENGAGEMENT', label: 'Engagement' },
] as const

const EXAMPLES = [
  'Sell the remaining 2-bedroom apartments in our new building this month',
  'Get 100 enquiries for the autumn menu and catering',
  'Bring more people to the website for the November sale',
  'Grow Instagram so locals know our new shop',
]

const field = 'w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400'
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function PlanWizard({ offerings, currency, hasAds, hasDossier }: { offerings: string[]; currency: string | null; hasAds: boolean; hasDossier: boolean }) {
  const P = usePrices()
  const router = useRouter()
  const [goal, setGoal] = useState('')
  const [objective, setObjective] = useState<(typeof OBJECTIVES)[number]['id']>('SALES')
  const [budget, setBudget] = useState('')
  const [{ start, end }] = useState(() => {
    const now = new Date()
    return { start: iso(now), end: iso(new Date(now.getTime() + 29 * 86_400_000)) }
  })
  const [startsOn, setStartsOn] = useState(start)
  const [endsOn, setEndsOn] = useState(end)
  const [focus, setFocus] = useState('')
  const [language, setLanguage] = useState<'English' | 'Georgian' | 'Russian'>('English')
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const submit = () =>
    startTransition(async () => {
      setError(undefined)
      const res = await createPlan({
        goal,
        objective,
        budget: budget ? Number(budget.replace(',', '.')) : null,
        startsOn,
        endsOn,
        focus: focus || undefined,
        language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if (res.error) return setError(res.error)
      router.push(`/app/strategy/${res.id}`)
    })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
          <Compass size={22} />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">What do you want to achieve?</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Say it like you would to your agency. Loudpilot reads your {hasDossier ? 'dossier' : 'brand'}, past posts and ads, and
          comes back with a plan — audiences, budget, ads, posts and goals — for you to approve.
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Goal</span>
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} className={field} placeholder={EXAMPLES[0]} aria-label="Goal" />
        <span className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" onClick={() => setGoal(x)} className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-200">
              {x}
            </button>
          ))}
        </span>
      </label>

      <div>
        <span className="mb-1 block text-sm font-medium">Main objective</span>
        <div className="flex flex-wrap gap-2">
          {OBJECTIVES.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={objective === o.id}
              onClick={() => setObjective(o.id)}
              className={`rounded-lg border px-3 py-2 text-sm ${objective === o.id ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:border-zinc-300'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Ad budget {currency && <span className="text-zinc-400">({currency})</span>}</span>
          <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="optional" className={field} aria-label="Ad budget" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">From</span>
          <input type="date" value={startsOn} min={start} onChange={(e) => setStartsOn(e.target.value)} className={field} aria-label="From" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">To</span>
          <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} className={field} aria-label="To" />
        </label>
      </div>
      {!hasAds && budget && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">No ad account connected — the plan will include ad setups, but without forecasts from your history.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Focus on</span>
          {offerings.length ? (
            <select value={focus} onChange={(e) => setFocus(e.target.value)} className={field} aria-label="Focus on">
              <option value="">Everything</option>
              {offerings.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="a product or service (optional)" className={field} aria-label="Focus on" />
          )}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Language of posts and ads</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)} className={field} aria-label="Language">
            <option>English</option>
            <option>Georgian</option>
            <option>Russian</option>
          </select>
        </label>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        onClick={submit}
        disabled={pending || goal.trim().length < 10}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        <Sparkles size={16} className={pending ? 'animate-pulse' : ''} />
        {pending ? 'Your strategist is working… about a minute' : `Build my plan · ${creditsLabel(P.strategy)}`}
      </button>
    </div>
  )
}
