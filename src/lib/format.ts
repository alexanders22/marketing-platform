// Number formatting shared by server and client components.

export function formatMoney(v: number, currency: string | null | undefined, digits = 2) {
  if (!currency) return v.toLocaleString('en-US', { maximumFractionDigits: digits })
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: digits }).format(v)
  } catch {
    return `${v.toFixed(digits)} ${currency}`
  }
}

export const formatNumber = (v: number) =>
  v >= 10_000 ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v) : v.toLocaleString('en-US')

export const formatPercent = (v: number | null, digits = 2) => (v === null ? '—' : `${(v * 100).toFixed(digits)}%`)
