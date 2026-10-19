'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { checkout } from './actions'

type Purchase = { kind: 'PACK'; credits: number } | { kind: 'PLAN'; plan: 'STARTER' | 'TEAM' | 'AGENCY'; cycle: 'MONTHLY' | 'YEARLY'; autoRenew?: boolean }

// Opens Monrem's payment page; the customer comes back to /app/credits.
export function BuyButton({ purchase, children, className, disabled }: { purchase: Purchase; children: React.ReactNode; className: string; disabled?: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  return (
    <>
      <button
        disabled={Boolean(disabled) || pending}
        title={disabled}
        onClick={() =>
          start(async () => {
            setError(undefined)
            const res = await checkout(purchase)
            if (res.url) window.location.assign(res.url)
            else setError(res.error ?? 'Could not open the payment page')
          })
        }
        className={`inline-flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      >
        {pending && <Loader2 size={14} className="animate-spin" />} {children}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </>
  )
}
