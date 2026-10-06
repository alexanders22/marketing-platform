// Chart palette and value formats, shared by server pages and the client
// charts in src/components/viz.tsx. Palette validated with the dataviz
// checks (violet, orange, aqua, blue, magenta — adjacent CVD ΔE ≥ 9).

export const VIZ = {
  accent: '#7b3ff2',
  series: ['#7b3ff2', '#eb6834', '#1baf7a', '#2a78d6', '#e87ba4'],
  other: '#a1a1aa',
  grid: '#ececf0',
  good: '#059669',
  bad: '#dc2626',
} as const

export const compact = (v: number) =>
  Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M` : Math.abs(v) >= 1e4 ? `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K` : Math.round(v).toLocaleString('en-US')

// How values read: counts compact (12.9K), money in the account currency,
// percents from ratios. Serializable, so server pages can pass it.
export type Unit = { kind?: 'count' | 'money' | 'percent'; currency?: string | null }
export function fmtUnit(u: Unit = {}, short = true) {
  return (v: number) => {
    if (u.kind === 'percent') return `${(v * 100).toFixed(v < 0.1 ? 2 : 1)}%`
    if (u.kind === 'money') {
      const big = Math.abs(v) >= 1000
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: u.currency || 'USD',
          currencyDisplay: 'narrowSymbol',
          ...(short && big
            ? { notation: 'compact', maximumFractionDigits: 1 }
            : Number.isInteger(v) || Math.abs(v) >= 100
              ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
              : { maximumFractionDigits: 2 }),
        }).format(v)
      } catch {
        return v.toFixed(2)
      }
    }
    return short ? compact(v) : Math.round(v).toLocaleString('en-US')
  }
}

