'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, CheckCircle2, Clapperboard, Coins, Compass, FileText, Film, ImageIcon, PenLine, Rocket, Share2, UserRound, Users, X, Code2 } from 'lucide-react'
import { DEFAULT_PRICING } from '@/lib/pricing'
import { BUNDLES, PLANS, TRIAL_DAYS, yearlyTotal, type PlanId } from '@/lib/plans'
import { VAT } from '@/lib/tax'
import { choosePlan } from '@/app/app/plan/actions'

const ICON = { STARTER: Rocket, TEAM: Users, AGENCY: Building2 }
const TINT = {
  STARTER: 'bg-emerald-50 text-emerald-600',
  TEAM: 'bg-sky-50 text-sky-600',
  AGENCY: 'bg-indigo-50 text-indigo-600',
}

// Ocoya-style "Choose your plan" panel. Closing it skips the plan for now.
export function PlanPicker({ current, after = '/app' }: { current?: PlanId | null; after?: string }) {
  const router = useRouter()
  const [yearly, setYearly] = useState(false)
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<PlanId | null>(null)
  const [error, setError] = useState<string>()

  const pick = (plan: PlanId) => {
    setBusy(plan)
    start(async () => {
      const res = await choosePlan({ plan, cycle: yearly ? 'YEARLY' : 'MONTHLY' })
      if (res.error) {
        setError(res.error)
        setBusy(null)
        return
      }
      router.push(after)
      router.refresh()
    })
  }

  return (
    <div className="relative grid overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 lg:grid-cols-[300px_1fr]">
      <button
        onClick={() => router.push(after)}
        className="absolute top-4 right-4 z-10 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
        aria-label="Close"
      >
        <X size={18} />
      </button>

      <aside className="border-b border-zinc-100 p-7 lg:border-r lg:border-b-0">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-sky-500 text-white">
          <Rocket size={20} />
        </span>
        <h2 className="mt-5 text-2xl font-semibold text-zinc-900">Choose your plan</h2>
        <p className="mt-2 text-zinc-500">Your brand is ready. Choose a plan to continue with Loudpilot.</p>
        <ul className="mt-6 space-y-4 border-t border-zinc-100 pt-6 text-[15px] text-zinc-700">
          {[`Try every feature free for ${TRIAL_DAYS} days`, 'No charge today', 'Cancel or change your plan anytime'].map(
            (t) => (
              <li key={t} className="flex gap-3">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" />
                {t}
              </li>
            ),
          )}
        </ul>
      </aside>

      <div className="p-6 sm:p-8">
        <div className="mx-auto mb-7 flex w-fit rounded-lg bg-zinc-100 p-1 text-sm">
          {[
            { v: false, l: 'Monthly' },
            { v: true, l: 'Yearly (2 months free)' },
          ].map((o) => (
            <button
              key={o.l}
              onClick={() => setYearly(o.v)}
              className={`rounded-md px-3.5 py-1.5 font-medium transition ${
                yearly === o.v ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => {
            const Icon = ICON[p.id]
            const isCurrent = current === p.id
            return (
              <div
                key={p.id}
                className={`flex flex-col rounded-xl border p-5 ${
                  p.popular ? 'border-2 border-sky-500' : 'border-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`grid h-9 w-9 place-items-center rounded-lg ${TINT[p.id]}`}>
                    <Icon size={17} />
                  </span>
                  <h3 className="text-lg font-semibold text-zinc-900">{p.name}</h3>
                  {p.popular && (
                    <span className="ml-auto rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
                      RECOMMENDED
                    </span>
                  )}
                </div>
                <p className="mt-3 min-h-10 text-sm text-zinc-500">{p.blurb}</p>
                <p className="mt-4 text-3xl font-semibold text-zinc-900">
                  ${yearly ? yearlyTotal(p.monthly).toLocaleString() : p.monthly}
                  <span className="text-base font-normal text-zinc-500"> / {yearly ? 'year' : 'month'}</span>
                </p>
                <p className="text-xs text-zinc-500">{yearly ? 'Billed yearly' : 'Billed monthly'} · incl. {Math.round(VAT.rate * 100)}% VAT</p>
                <button
                  onClick={() => pick(p.id)}
                  disabled={pending}
                  className={`mt-4 rounded-lg py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                    p.popular
                      ? 'bg-gradient-to-r from-emerald-500 to-sky-500 text-white hover:opacity-90'
                      : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
                  }`}
                >
                  {busy === p.id ? 'Starting…' : isCurrent ? 'Current plan' : `Start ${TRIAL_DAYS}-day free trial`}
                </button>
                <p className="mt-5 text-xs font-semibold tracking-wide text-zinc-500">WHAT&apos;S INCLUDED</p>
                <ul className="mt-2 space-y-2.5 text-sm text-zinc-700">
                  <Row icon={UserRound} label="Users" value={p.users} />
                  <Row icon={Building2} label="Companies" value={p.companies} />
                  <Row icon={Share2} label="Social profiles" value={p.profiles} />
                  <Row icon={Code2} label="API & webhooks" value={p.id === 'AGENCY' ? 'Included' : '—'} />
                </ul>
                <p className="mt-4 text-xs font-semibold tracking-wide text-zinc-500">EVERY MONTH</p>
                <ul className="mt-2 space-y-2.5 text-sm text-zinc-700">
                  <Row icon={PenLine} label="AI-written posts" value={BUNDLES[p.id].posts.toLocaleString()} />
                  <Row icon={ImageIcon} label="AI images" value={BUNDLES[p.id].images.toLocaleString()} />
                  <Row icon={Film} label="AI videos with voice-over" value={BUNDLES[p.id].videos.toLocaleString()} />
                  <Row icon={Clapperboard} label="AI clips (Veo)" value={`${DEFAULT_PRICING.veoSecondsPerMonth[p.id]}s`} />
                  <Row icon={FileText} label="Blog articles" value={BUNDLES[p.id].articles.toLocaleString()} />
                  <Row icon={Compass} label="Strategy plans" value={BUNDLES[p.id].strategies.toLocaleString()} />
                </ul>
                <p className="mt-3 flex items-start gap-1.5 text-xs text-zinc-500">
                  <Coins size={13} className="mt-0.5 shrink-0" /> Runs on {p.credits.toLocaleString()} AI credits — use them for any mix you like.
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Row({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <li className="flex items-center justify-between">
      <span className="inline-flex items-center gap-2 text-zinc-600">
        <Icon size={15} />
        {label}
      </span>
      <span>{value}</span>
    </li>
  )
}
