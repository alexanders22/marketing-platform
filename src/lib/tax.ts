// VAT: Loudpilot's list prices are without Georgian VAT (18%); it is added
// when the customer pays. Shared by the site, the app and the admin
// (payments, bookings, margins).

export const VAT = { rate: 0.18, country: 'Georgia' } as const

const cents = (n: number) => Math.round(n * 100) / 100

// A list price (without VAT) with its VAT and what the customer pays.
export function vatParts(price: number) {
  const net = cents(price)
  const vat = cents(price * VAT.rate)
  return { gross: cents(net + vat), net, vat }
}

// What the customer pays for a list price.
export const grossOf = (price: number) => vatParts(price).gross
