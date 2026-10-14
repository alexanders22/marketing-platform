'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { DEFAULT_CREDIT_VALUE, type CreditValue } from '@/lib/money'
import { DEFAULT_PRICES, type Prices } from '@/lib/pricing'

// Current credit prices (set by super admins), for every "· N credits" label,
// and what a credit is worth in money (USD, and lari per dollar).
const PricesContext = createContext<Prices>(DEFAULT_PRICES)
const ValueContext = createContext<CreditValue>(DEFAULT_CREDIT_VALUE)

export function PricesProvider({ prices, value, children }: { prices: Prices; value?: CreditValue; children: ReactNode }) {
  return (
    <PricesContext.Provider value={prices}>
      <ValueContext.Provider value={value ?? DEFAULT_CREDIT_VALUE}>{children}</ValueContext.Provider>
    </PricesContext.Provider>
  )
}

export const usePrices = () => useContext(PricesContext)
export const useCreditValue = () => useContext(ValueContext)
