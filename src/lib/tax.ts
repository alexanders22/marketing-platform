// VAT: Loudpilot's prices include Georgian VAT (18%). Shared by the site,
// the app and the admin (bookings, margins).

export const VAT = { rate: 0.18, country: 'Georgia', included: true } as const

const cents = (n: number) => Math.round(n * 100) / 100

// A VAT-inclusive amount split into net and VAT.
export function vatParts(gross: number) {
  const net = cents(gross / (1 + VAT.rate))
  return { gross: cents(gross), net, vat: cents(gross - net) }
}

export const netOf = (gross: number) => gross / (1 + VAT.rate)
