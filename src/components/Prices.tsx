'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { DEFAULT_PRICES, type Prices } from '@/lib/pricing'

// Current credit prices (set by super admins), for every "· N credits" label.
const PricesContext = createContext<Prices>(DEFAULT_PRICES)

export function PricesProvider({ prices, children }: { prices: Prices; children: ReactNode }) {
  return <PricesContext.Provider value={prices}>{children}</PricesContext.Provider>
}

export const usePrices = () => useContext(PricesContext)
