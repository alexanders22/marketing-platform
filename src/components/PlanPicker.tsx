'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, CheckCircle2, Clapperboard, Coins, Compass, FileText, Film, ImageIcon, PenLine, Rocket, Share2, Users, X, Code2 } from 'lucide-react'
import { DEFAULT_PRICING } from '@/lib/pricing'
import { BUNDLES, PLANS, TRIAL_DAYS, yearlyTotal, type PickerPrices, type PlanId } from '@/lib/plans'
import { VAT } from '@/lib/tax'
import { choosePlan } from '@/app/app/plan/actions'

const ICON = { STARTER: Rocket, TEAM: Users, AGENCY: Building2 }
const TINT = {
  STARTER: 'bg-emerald-50 text-emerald-600',
  TEAM: 'bg-sky-50 text-sky-600',
  AGENCY: 'bg-indigo-50 text-indigo-600',
}

// "Choose your plan": what the trial promises on top, the plans below in
// full width. Closing it skips the plan for now. `trialUsed` (the account
// had its trial already) turns trial wording into plain plan choice; `paid`
// (the current plan is paid for) makes the others an upgrade (bought) or a switch.
export function PlanPicker({
  current,
  after = '/app',
  prices,
  trialUsed = false,
  paid = false,
}: {
  current?: PlanId | null
  after?: string
  prices?: PickerPrices
  trialUsed?: boolean
  paid?: boolean
}) {
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
      // A dearer plan during a paid period: pay for it first.
      if (res.pay) return router.push(res.pay)
      router.push(after)
      router.refresh()
    })
  }

  const points = trialUsed
    ? ['Pay by card, monthly or yearly', 'Your posts, channels and credits are kept', 'Cancel or change your plan anytime']
    : [`Try Loudpilot free for ${TRIAL_DAYS} days`, 'No charge today', 'Cancel or change your plan anytime']

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
      <button
        onClick={() => router.push(after)}
        className="absolute top-4 right-4 z-10 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
        aria-label="Close"
      >
        <X size={18} />
      </button>

      <header className="flex flex-col gap-6 border-b border-zinc-100 p-6 pr-14 sm:p-8 sm:pr-16 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-sky-500 text-white">
            <Rocket size={20} />
          </span>
          <div>
            <h2 className="text-2xl font-semibold text-zinc-900">Choose your plan</h2>
            <p className="mt-1 text-zinc-500">{trialUsed ? 'Choose a plan to continue with Loudpilot.' : 'Your brand is ready. Choose a plan to continue with Loudpilot.'}</p>
          </div>
        </div>
        <ul className="flex flex-col gap-2 text-[15px] text-zinc-700 sm:flex-row sm:flex-wrap sm:gap-x-6">
          {points.map((t) => (
            <li key={t} className="flex items-center gap-2">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
              {t}
            </li>
          ))}
        </ul>
      </header>

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
          {PLANS.map((base) => {
            const live = prices?.plans.find((x) => x.id === base.id)
            const p = { ...base, monthly: live?.monthly ?? base.monthly, monthlyGel: live?.monthlyGel ?? base.monthlyGel, credits: live?.credits ?? base.credits, bundle: live?.bundle ?? BUNDLES[base.id], veo: live?.veo ?? DEFAULT_PRICING.veoSecondsPerMonth[base.id] }
            const shown = yearly ? yearlyTotal(p.monthly) : p.monthly
            const shownGel = yearly ? yearlyTotal(p.monthlyGel) : p.monthlyGel
            const Icon = ICON[p.id]
            const isCurrent = current === p.id
            const currentMonthly = prices?.plans.find((x) => x.id === current)?.monthly ?? PLANS.find((x) => x.id === current)?.monthly ?? 0
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
                  ₾{shownGel.toLocaleString('en-US')}
                  <span className="text-base font-normal text-zinc-500"> / {yearly ? 'year' : 'month'}</span>
                  <span className="ml-2 text-sm font-normal text-zinc-400">${shown.toLocaleString('en-US')}</span>
                </p>
                <p className="text-xs text-zinc-500">{yearly ? 'Billed yearly' : 'Billed monthly'} · {Math.round(VAT.rate * 100)}% VAT not included</p>
                <button
                  onClick={() => pick(p.id)}
                  disabled={pending}
                  className={`mt-4 rounded-lg py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                    p.popular
                      ? 'bg-gradient-to-r from-emerald-500 to-sky-500 text-white hover:opacity-90'
                      : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
                  }`}
                >
                  {busy === p.id
                    ? 'Starting…'
                    : isCurrent
                      ? 'Current plan'
                      : paid
                        ? p.monthly > currentMonthly
                          ? `Upgrade to ${p.name}`
                          : `Switch to ${p.name}`
                        : trialUsed
                          ? `Choose ${p.name}`
                          : `Start ${TRIAL_DAYS}-day free trial`}
                </button>
                <p className="mt-5 text-xs font-semibold tracking-wide text-zinc-500">WHAT&apos;S INCLUDED</p>
                <ul className="mt-2 space-y-2.5 text-sm text-zinc-700">
                  <Row icon={Building2} label="Companies" value={p.companies} />
                  <Row icon={Share2} label="Social profiles per company" value={p.profiles} />
                  <Row icon={Code2} label="API & webhooks" value={p.id === 'AGENCY' ? 'Included' : '—'} />
                </ul>
                <p className="mt-4 text-xs font-semibold tracking-wide text-zinc-500">EVERY MONTH</p>
                <ul className="mt-2 space-y-2.5 text-sm text-zinc-700">
                  <Row icon={PenLine} label="AI-written posts" value={p.bundle.posts.toLocaleString()} />
                  <Row icon={ImageIcon} label="AI images" value={p.bundle.images.toLocaleString()} />
                  <Row icon={Film} label="AI videos with voice-over" value={p.bundle.videos.toLocaleString()} />
                  <Row icon={Clapperboard} label="AI clips (Veo)" value={p.veo ? `${p.veo}s` : '—'} />
                  <Row icon={FileText} label="Blog articles" value={p.bundle.articles.toLocaleString()} />
                  <Row icon={Compass} label="Strategy plans" value={p.bundle.strategies.toLocaleString()} />
                </ul>
                <p className="mt-3 flex items-start gap-1.5 text-xs text-zinc-500">
                  <Coins size={13} className="mt-0.5 shrink-0" /> Runs on {p.credits.toLocaleString()} AI credits — use them for any mix you like.
                </p>
              </div>
            )
          })}
        </div>
        <p className="mt-5 flex items-start gap-2 text-sm text-zinc-600">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
          <span>
            <span className="font-medium text-zinc-900">Every plan has the same tools</span> — planner, Design and Video Studio, inbox,
            Meta ads results, analytics, weekly review, website tag and chat, competitors and SEO. Plans differ in companies, social
            profiles and AI credits; AI clips (Veo) and the API follow the plan.
          </span>
        </p>
      </div>
    </div>
  )
}

function Row({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="inline-flex min-w-0 items-center gap-2 text-zinc-600">
        <Icon size={15} className="shrink-0" />
        {label}
      </span>
      <span className="shrink-0 font-medium text-zinc-900">{value}</span>
    </li>
  )
}
