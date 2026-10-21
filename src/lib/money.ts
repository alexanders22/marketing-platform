// What credits are worth in money (shared by server and client): the price
// of a credit in USD and lari per dollar (National Bank of Georgia).
export type CreditValue = { usd: number; gelPerUsd: number }

export const DEFAULT_CREDIT_VALUE: CreditValue = { usd: 0.08, gelPerUsd: 2.7 }

// "₾2.70" and "$1.00" for n credits.
export function creditMoney(n: number, v: CreditValue) {
  const usd = n * v.usd
  const gel = usd * v.gelPerUsd
  const f = (x: number, sym: string) => `${sym}${x < 10 ? x.toFixed(2) : Math.round(x).toLocaleString('en-US')}`
  return { gel: f(gel, '₾'), usd: f(usd, '$') }
}
