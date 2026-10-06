'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pause, Play, Rocket } from 'lucide-react'
import type { AdAccountChoice, BoostView } from '@/lib/boost'
import { AD_CATEGORIES, BOOST_COUNTRIES, BOOST_GOAL_IDS, BOOST_GOALS, type AdCategory, type BoostGoal } from '@/lib/boost-options'
import { formatMetric } from '@/lib/goal-metrics'
import { boostPost, changeBoost } from './boost-actions'

const money = (v: number, cur: string | null) => formatMetric(v, 'money', cur)
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

const field = 'rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm'

// How to make boosting work: shown when no ad account can boost yet.
export function BoostHowTo({ accounts }: { accounts: AdAccountChoice[] }) {
  return (
    <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
      <p className="font-semibold">To boost posts from Loudpilot</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-4">
        <li>
          Connect Meta in <Link href="/app/channels" className="underline">Channels</Link> and pick your ad account.
        </li>
        <li>Allow &ldquo;Manage ads&rdquo; when Facebook asks (connected earlier? Reconnect once).</li>
        <li>In Meta Business settings, give the ad account your Page (and Instagram account), and yourself &ldquo;Advertise&rdquo; access.</li>
        <li>Add a payment method in Meta Ads Manager → Billing.</li>
      </ol>
      {accounts.map((a) => a.problem && <p key={a.id} className="mt-1.5">{a.name}: {a.problem}</p>)}
    </div>
  )
}

function BoostRow({ b, canSpend }: { b: BoostView; canSpend: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string>()
  const status = b.status === 'FAILED' ? 'Failed' : b.ended ? 'Ended' : b.status === 'PAUSED' ? 'Paused' : 'Running'
  const tone = status === 'Running' ? 'bg-emerald-50 text-emerald-700' : status === 'Failed' ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-600'
  const toggle = (to: 'ACTIVE' | 'PAUSED') =>
    start(async () => {
      const r = await changeBoost(b.id, to)
      setErr(r.error)
      router.refresh()
    })
  return (
    <div className="mt-2 rounded-lg border border-zinc-200 p-2.5 text-xs" aria-label="Boost">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 font-semibold ${tone}`}>{status}</span>
        <span className="font-medium text-zinc-800">{BOOST_GOALS[b.goal as BoostGoal]?.label ?? b.goal}</span>
        <span className="text-zinc-500">
          {money(b.dailyBudget, b.currency)}/day · {day(b.startsAt)}–{day(b.endsAt)} · {b.audience.countries.join(', ')} · {b.audience.ageMin}–{b.audience.ageMax}
        </span>
        {canSpend && !b.ended && b.status !== 'FAILED' && (
          <button
            disabled={pending}
            onClick={() => toggle(b.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED')}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            {b.status === 'PAUSED' ? (
              <>
                <Play size={12} /> Resume
              </>
            ) : (
              <>
                <Pause size={12} /> Pause
              </>
            )}
          </button>
        )}
      </div>
      {b.error && <p className="mt-1 text-red-600">{b.error}</p>}
      {b.results && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-zinc-500">
          <span>
            Spent <b className="text-zinc-800">{money(b.results.spend, b.currency)}</b>
          </span>
          <span>
            Reach <b className="text-zinc-800">{b.results.reach.toLocaleString('en-US')}</b>
          </span>
          <span>
            {b.results.label} <b className="text-zinc-800">{b.results.results.toLocaleString('en-US')}</b>
          </span>
          {b.results.results > 0 && (
            <span>
              Cost per result <b className="text-zinc-800">{money(b.results.spend / b.results.results, b.currency)}</b>
            </span>
          )}
        </div>
      )}
      {err && <p className="mt-1 text-red-600">{err}</p>}
    </div>
  )
}

export function BoostPanel({
  deliveryId,
  network,
  boosts,
  accounts,
  canSpend,
  hasLink,
}: {
  deliveryId: string
  network: 'FACEBOOK' | 'INSTAGRAM'
  boosts: BoostView[]
  accounts: AdAccountChoice[]
  canSpend: boolean
  hasLink: boolean
}) {
  const router = useRouter()
  const ready = accounts.filter((a) => a.canBoost)
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string>()
  const [s, setS] = useState({
    adAccountId: ready[0]?.id ?? '',
    goal: 'ENGAGEMENT' as BoostGoal,
    dailyBudget: 10,
    days: 7,
    startsOn: '',
    countries: ['GE'],
    ageMin: 18,
    ageMax: 65,
    gender: 'ALL' as 'ALL' | 'MEN' | 'WOMEN',
    placements: 'AUTO' as 'AUTO' | 'NETWORK_ONLY',
    category: 'NONE' as AdCategory,
    paused: false,
  })
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((x) => ({ ...x, [k]: v }))
  const currency = ready.find((a) => a.id === s.adAccountId)?.currency ?? null
  const special = s.category !== 'NONE'
  const running = boosts.some((b) => !b.ended && (b.status === 'ACTIVE' || b.status === 'PAUSED'))

  const submit = () =>
    start(async () => {
      const total = money(s.dailyBudget * s.days, currency)
      if (!s.paused && !confirm(`Start the boost? Meta charges your ad account up to ${total}.`)) return
      const r = await boostPost({ deliveryId, ...s, startsOn: s.startsOn || null })
      if (r.error) return setErr(r.error)
      setErr(undefined)
      setOpen(false)
      router.refresh()
    })

  return (
    <div>
      {boosts.map((b) => (
        <BoostRow key={b.id} b={b} canSpend={canSpend} />
      ))}
      {!running && !open && (
        <button
          onClick={() => setOpen(true)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
        >
          <Rocket size={13} /> Boost
        </button>
      )}
      {open && (
        <div className="mt-2 space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 text-sm" role="region" aria-label="Boost settings">
          {ready.length === 0 ? (
            <BoostHowTo accounts={accounts} />
          ) : !canSpend ? (
            <p className="text-xs text-zinc-600">Only the owner or an admin can spend the ad budget.</p>
          ) : (
            <>
              {ready.length > 1 && (
                <label className="flex items-center gap-2">
                  <span className="w-28 text-xs text-zinc-500">Ad account</span>
                  <select value={s.adAccountId} onChange={(e) => set('adAccountId', e.target.value)} className={field}>
                    {ready.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <fieldset>
                <legend className="mb-1 text-xs text-zinc-500">Goal</legend>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  {BOOST_GOAL_IDS.map((g) => (
                    <label key={g} className={`cursor-pointer rounded-lg border p-2 ${s.goal === g ? 'border-indigo-500 bg-white' : 'border-zinc-200'}`}>
                      <input type="radio" name={`goal-${deliveryId}`} className="sr-only" checked={s.goal === g} onChange={() => set('goal', g)} />
                      <span className="block text-xs font-semibold">{BOOST_GOALS[g].label}</span>
                      <span className="block text-[11px] text-zinc-500">{BOOST_GOALS[g].hint}</span>
                    </label>
                  ))}
                </div>
                {s.goal === 'TRAFFIC' && !hasLink && <p className="mt-1 text-xs text-amber-700">This post has no link — add a call to action with a link first.</p>}
              </fieldset>

              <div className="flex flex-wrap items-center gap-2">
                <span className="w-28 text-xs text-zinc-500">Budget</span>
                <label className="flex items-center gap-1">
                  <input type="number" min={1} value={s.dailyBudget} onChange={(e) => set('dailyBudget', Number(e.target.value))} className={`${field} w-24`} aria-label="Daily budget" />
                  <span className="text-xs text-zinc-500">{currency ?? ''} a day for</span>
                </label>
                <label className="flex items-center gap-1">
                  <input type="number" min={1} max={30} value={s.days} onChange={(e) => set('days', Number(e.target.value))} className={`${field} w-16`} aria-label="Days" />
                  <span className="text-xs text-zinc-500">days</span>
                </label>
                <span className="text-xs font-semibold text-zinc-700">= up to {money(s.dailyBudget * s.days, currency)}</span>
              </div>
              <label className="flex items-center gap-2">
                <span className="w-28 text-xs text-zinc-500">Starts</span>
                <input type="date" value={s.startsOn} onChange={(e) => set('startsOn', e.target.value)} className={field} aria-label="Start day" />
                <span className="text-xs text-zinc-400">empty = after Meta&rsquo;s review</span>
              </label>

              <label className="flex items-center gap-2">
                <span className="w-28 text-xs text-zinc-500">Ad category</span>
                <select value={s.category} onChange={(e) => set('category', e.target.value as AdCategory)} className={field} aria-label="Ad category">
                  {Object.entries(AD_CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              {special && <p className="text-xs text-zinc-500">Meta requires ads about housing, jobs and credit to reach all ages 18–65 and all genders.</p>}

              <fieldset className="space-y-2">
                <legend className="mb-1 text-xs text-zinc-500">Audience</legend>
                <div className="flex flex-wrap gap-1.5">
                  {BOOST_COUNTRIES.map(([code, name]) => {
                    const on = s.countries.includes(code)
                    return (
                      <button
                        key={code}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set('countries', on ? s.countries.filter((c) => c !== code) : [...s.countries, code])}
                        className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-zinc-300 bg-white'}`}
                      >
                        {name}
                      </button>
                    )
                  })}
                </div>
                {!special && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-zinc-500">
                      Age
                      <input type="number" min={18} max={65} value={s.ageMin} onChange={(e) => set('ageMin', Number(e.target.value))} className={`${field} w-16`} aria-label="Minimum age" />–
                      <input type="number" min={18} max={65} value={s.ageMax} onChange={(e) => set('ageMax', Number(e.target.value))} className={`${field} w-16`} aria-label="Maximum age" />
                    </label>
                    <select value={s.gender} onChange={(e) => set('gender', e.target.value as typeof s.gender)} className={field} aria-label="Gender">
                      <option value="ALL">All genders</option>
                      <option value="WOMEN">Women</option>
                      <option value="MEN">Men</option>
                    </select>
                  </div>
                )}
              </fieldset>

              <label className="flex items-center gap-2">
                <span className="w-28 text-xs text-zinc-500">Placements</span>
                <select value={s.placements} onChange={(e) => set('placements', e.target.value as typeof s.placements)} className={field} aria-label="Placements">
                  <option value="AUTO">Automatic (Facebook, Instagram, Messenger)</option>
                  <option value="NETWORK_ONLY">{network === 'INSTAGRAM' ? 'Instagram only' : 'Facebook only'}</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input type="checkbox" checked={s.paused} onChange={(e) => set('paused', e.target.checked)} />
                Create paused — I&rsquo;ll check it in Meta Ads Manager first
              </label>

              <p className="text-xs text-zinc-500">Meta reviews every ad, usually within 24 hours. Results appear here and on the dashboard within an hour of delivery.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={submit}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Rocket size={14} /> {pending ? 'Boosting…' : s.paused ? 'Create paused boost' : 'Boost post'}
                </button>
                <button onClick={() => setOpen(false)} className="text-sm text-zinc-500 hover:underline">
                  Cancel
                </button>
              </div>
            </>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
          {ready.length === 0 && (
            <button onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:underline">
              Close
            </button>
          )}
        </div>
      )}
    </div>
  )
}
