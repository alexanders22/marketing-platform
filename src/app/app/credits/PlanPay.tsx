'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
import { confirmDialog } from '@/components/ui/Dialog'
import { BuyButton } from './BuyButton'
import { cancelRenewal } from './actions'

type PlanId = 'STARTER' | 'TEAM' | 'AGENCY'

// Pay for the plan: a month or a year, renewing automatically when Monrem
// has a recurring plan for that price (on by default), or once.
export function PlanPay({ plan, monthly, yearly, renew, active, disabled }: { plan: PlanId; monthly: string; yearly: string; renew: { MONTHLY: boolean; YEARLY: boolean }; active: boolean; disabled?: string }) {
  const any = renew.MONTHLY || renew.YEARLY
  const [auto, setAuto] = useState(any)
  return (
    <div className="mt-4" aria-label="Pay for the plan">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <BuyButton purchase={{ kind: 'PLAN', plan, cycle: 'MONTHLY', autoRenew: auto && renew.MONTHLY }} disabled={disabled} className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
            {auto && renew.MONTHLY ? `${monthly} / month` : `${active ? 'Extend' : 'Pay'} 1 month · ${monthly}`}
          </BuyButton>
        </div>
        <div>
          <BuyButton purchase={{ kind: 'PLAN', plan, cycle: 'YEARLY', autoRenew: auto && renew.YEARLY }} disabled={disabled} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold hover:bg-zinc-50">
            {auto && renew.YEARLY ? `${yearly} / year` : `1 year · ${yearly}`}
          </BuyButton>
        </div>
      </div>
      {any && (
        <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-3.5 w-3.5 accent-zinc-900" />
          Renew automatically — cancel any time
        </label>
      )}
    </div>
  )
}

export function CancelRenewal({ until }: { until: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        onClick={async () => {
          if (!(await confirmDialog('Turn off auto-renewal?', { body: `Your plan stays active until ${until}. After that it won't be charged again.`, confirm: 'Turn off', danger: true }))) return
          start(async () => {
            const res = await cancelRenewal()
            setError(res.error)
            router.refresh()
          })
        }}
        className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Turn off auto-renewal
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
