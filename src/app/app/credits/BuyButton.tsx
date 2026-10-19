'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import type { BillingAddress } from '@/lib/billing-address'
import { checkout } from './actions'
import { AddressDialog } from './AddressDialog'

type Purchase = { kind: 'PACK'; credits: number } | { kind: 'PLAN'; plan: 'STARTER' | 'TEAM' | 'AGENCY'; cycle: 'MONTHLY' | 'YEARLY'; autoRenew?: boolean }

// Opens Monrem's payment page; the customer comes back to /app/credits.
// The first payment asks for the billing address on the way.
export function BuyButton({ purchase, children, className, disabled }: { purchase: Purchase; children: React.ReactNode; className: string; disabled?: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  const [address, setAddress] = useState<{ draft: BillingAddress; error?: string } | null>(null)

  const pay = (withAddress?: BillingAddress) =>
    start(async () => {
      setError(undefined)
      const res = await checkout(purchase, withAddress)
      if (res.url) return window.location.assign(res.url)
      if (res.needAddress) return setAddress({ draft: withAddress ?? res.needAddress, error: res.error })
      setAddress(null)
      setError(res.error ?? 'Could not open the payment page')
    })

  return (
    <>
      <button
        disabled={Boolean(disabled) || pending}
        title={disabled}
        onClick={() => pay()}
        className={`inline-flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      >
        {pending && !address && <Loader2 size={14} className="animate-spin" />} {children}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
      {address && (
        <AddressDialog key={address.error} initial={address.draft} error={address.error} submitLabel="Continue to payment" pending={pending} onClose={() => setAddress(null)} onSubmit={(a) => pay(a)} />
      )}
    </>
  )
}
