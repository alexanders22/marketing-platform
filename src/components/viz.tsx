'use client'

import { useId, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { VIZ, compact, fmtUnit, type Unit } from '@/lib/viz'

const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

// Dependency-free SVG charts and stat tiles. Palette validated with the
// dataviz checks (violet, orange, aqua, blue, magenta — adjacent CVD ΔE ≥ 9);
// aqua and magenta sit under 3:1 on white, so every multi-series chart
// labels its values. Thin marks, 2px lines, a 10% wash under areas.

// 0 and up to 3 clean ticks above the data.
function niceTicks(max: number) {
  if (max <= 0) return [0, 1]
  const raw = max / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  const top = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = 0; v <= top + 1e-9; v += step) out.push(+v.toFixed(6))
  return out
}

/* ─── Delta pill ─── */

// `neutral`: the change is neither good nor bad (e.g. spend).
export function DeltaPill({ cur, prev, lowerIsBetter = false, neutral = false, label = 'vs previous period' }: { cur: number | null; prev: number | null; lowerIsBetter?: boolean; neutral?: boolean; label?: string }) {
  if (cur === null || prev === null || prev === 0) return <span className="text-xs text-zinc-400">—</span>
  const c = (cur - prev) / prev
  if (Math.abs(c) < 0.005)
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-600" title={label}>
        <Minus size={11} /> 0%
      </span>
    )
  const good = lowerIsBetter ? c < 0 : c > 0
  const Icon = c > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${neutral ? 'bg-zinc-100 text-zinc-600' : good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
      title={label}
    >
      <Icon size={11} />
      {Math.abs(c * 100) >= 100 ? Math.round(Math.abs(c * 100)) : Math.abs(c * 100).toFixed(1)}%
    </span>
  )
}

/* ─── Sparkline ─── */

export function Sparkline({
  values,
  dates,
  color = VIZ.accent,
  unit,
  height = 40,
  label,
}: {
  values: number[]
  dates?: string[]
  color?: string
  unit?: Unit
  height?: number
  label: string
}) {
  const format = fmtUnit(unit, false)
  const id = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const W = 160
  const n = values.length
  if (n < 2) return <div style={{ height }} />
  const max = Math.max(...values, 1e-9)
  const min = Math.min(...values, 0)
  const x = (i: number) => (i / (n - 1)) * (W - 6) + 3
  const y = (v: number) => height - 4 - ((v - min) / (max - min || 1)) * (height - 10)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const h = hover ?? n - 1
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} role="img" aria-label={`${label} (trend)`}>
        <defs>
          <linearGradient id={`sp${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${x(n - 1)},${height} L${x(0)},${height} Z`} fill={`url(#sp${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {values.map((_, i) => (
          <rect key={i} x={x(i) - W / n / 2} y={0} width={W / n} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      <span
        className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
        style={{ left: `${(x(h) / W) * 100}%`, top: y(values[h]), background: color }}
      />
      {hover !== null && (
        <span className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 rounded-md bg-zinc-900 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-white" style={{ left: `${(x(hover) / W) * 100}%` }}>
          {dates ? `${short(dates[hover])} · ` : ''}
          {format(values[hover])}
        </span>
      )}
    </div>
  )
}

/* ─── Stat tile ─── */

export function StatTile({
  label,
  value,
  delta,
  icon,
  tint = 'bg-violet-50 text-violet-600',
  spark,
  foot,
}: {
  label: string
  value: string
  delta?: ReactNode
  icon?: ReactNode
  tint?: string
  spark?: ReactNode
  foot?: ReactNode
}) {
  return (
    <div role="group" aria-label={label} className="group min-w-0 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(16,16,32,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(91,33,182,0.25)]">
      <div className="flex items-center gap-2">
        {icon && <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tint}`}>{icon}</span>}
        <p className="truncate text-xs font-medium text-zinc-500">{label}</p>
        <span className="ml-auto shrink-0">{delta}</span>
      </div>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">{value}</p>
      {spark && <div className="mt-2">{spark}</div>}
      {foot && <div className="mt-1 text-xs text-zinc-500">{foot}</div>}
    </div>
  )
}

/* ─── Trend chart (one series, area or columns) ─── */

export function TrendChart({
  data,
  label,
  color = VIZ.accent,
  kind = 'area',
  unit,
  height = 180,
}: {
  data: { date: string; value: number }[]
  label: string
  color?: string
  kind?: 'area' | 'bars'
  unit?: Unit
  height?: number
}) {
  const format = fmtUnit(unit)
  const full = fmtUnit(unit, false)
  const id = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const W = 600
  const PAD = { top: 10, right: 6, bottom: 22, left: 40 }
  const n = data.length
  const ticks = niceTicks(Math.max(...data.map((d) => d.value), 0))
  const top = ticks.at(-1) || 1
  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const step = innerW / Math.max(1, n)
  const x = (i: number) => PAD.left + (kind === 'bars' ? i * step + step / 2 : n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH
  const bw = Math.min(24, Math.max(2, step - 2))
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  const xt = n <= 1 ? [0] : n <= 7 ? data.map((_, i) => i) : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1]
  const empty = data.every((d) => d.value === 0)
  const h = hover !== null ? data[hover] : null
  return (
    <figure className="relative" onMouseLeave={() => setHover(null)}>
      <figcaption className="sr-only">{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${height}`} className="block w-full" style={{ height }} role="img" aria-label={label}>
        <defs>
          <linearGradient id={`tc${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.2" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={VIZ.grid} strokeWidth="1" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-zinc-400 text-[11px] tabular-nums">
              {format(t)}
            </text>
          </g>
        ))}
        {xt.map((i) => (
          <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 && kind === 'area' ? 'start' : i === n - 1 && kind === 'area' ? 'end' : 'middle'} className="fill-zinc-400 text-[11px]">
            {data[i] ? short(data[i].date) : ''}
          </text>
        ))}
        {kind === 'area' ? (
          <>
            <path d={`${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#tc${id})`} />
            <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </>
        ) : (
          data.map((d, i) => {
            const hgt = Math.max(0, y(0) - y(d.value))
            const r = Math.min(4, hgt, bw / 2)
            const x0 = x(i) - bw / 2
            const y0 = y(d.value)
            return (
              <path
                key={d.date}
                d={`M${x0},${y(0)} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${y(0)} Z`}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
            )
          })
        )}
        {h && kind === 'area' && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={PAD.top} y2={y(0)} stroke="#d4d4d8" strokeWidth="1" />
            <circle cx={x(hover!)} cy={y(h.value)} r="4.5" fill={color} stroke="#fff" strokeWidth="2" />
          </>
        )}
        {data.map((d, i) => (
          <rect key={d.date} x={x(i) - (kind === 'bars' ? step : innerW / Math.max(1, n - 1)) / 2} y={PAD.top} width={kind === 'bars' ? step : innerW / Math.max(1, n - 1)} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {empty && <p className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-zinc-400">No data in this period</p>}
      {h && (
        <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-zinc-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow-lg" style={{ left: `${(x(hover!) / W) * 100}%` }}>
          <span className="text-zinc-400">{short(h.date)}</span> <b className="tabular-nums">{full(h.value)}</b>
        </div>
      )}
    </figure>
  )
}

/* ─── Progress ring ─── */

export function Ring({ value, size = 64, stroke = 7, color = VIZ.accent, track = '#f1edfe', label, children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; label: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          style={{ transition: 'stroke-dasharray 900ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

/* ─── Donut with a labelled legend ─── */

export function Donut({ items, label, unit, center }: { items: { label: string; value: number }[]; label: string; unit?: Unit; center?: ReactNode }) {
  const format = fmtUnit(unit)
  const [hover, setHover] = useState<number | null>(null)
  // Five slots in fixed order; the rest fold into "Other".
  const top = items.slice(0, 5)
  const rest = items.slice(5).reduce((s, x) => s + x.value, 0)
  const all = rest > 0 ? [...top, { label: 'Other', value: rest }] : top
  const total = all.reduce((s, x) => s + x.value, 0) || 1
  const size = 140
  const stroke = 22
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const gap = all.length > 1 ? 2 : 0
  // Where each segment starts along the ring.
  const starts = all.map((_, i) => all.slice(0, i).reduce((sum, x) => sum + (x.value / total) * c, 0))
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={label}>
          {all.map((x, i) => {
            const len = (x.value / total) * c
            return (
              <circle
                key={x.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={i < 5 ? VIZ.series[i] : VIZ.other}
                strokeWidth={hover === i ? stroke + 4 : stroke}
                strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                strokeDashoffset={-starts[i]}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: 'stroke-width 150ms' }}
              />
            )
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          {hover !== null ? (
            <div>
              <p className="text-lg font-semibold tabular-nums">{Math.round((all[hover].value / total) * 100)}%</p>
              <p className="max-w-[80px] truncate text-[11px] text-zinc-500">{all[hover].label}</p>
            </div>
          ) : (
            center
          )}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm" aria-label={`${label} legend`}>
        {all.map((x, i) => (
          <li key={x.label} className="flex items-center gap-2" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i < 5 ? VIZ.series[i] : VIZ.other }} />
            <span className="min-w-0 flex-1 truncate text-zinc-700">{x.label}</span>
            <span className="font-medium text-zinc-900 tabular-nums">{format(x.value)}</span>
            <span className="w-10 text-right text-xs text-zinc-400 tabular-nums">{Math.round((x.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ─── Funnel: steps with the share that moves on ─── */

export function Funnel({ steps, label }: { steps: { label: string; value: number; hint?: string }[]; label: string }) {
  const GRAD = ['from-[#7b3ff2] to-[#9b5cf6]', 'from-[#9b5cf6] to-[#c04ddb]', 'from-[#c04ddb] to-[#ff2e6e]', 'from-[#ff2e6e] to-[#ff5b14]']
  return (
    <ol className="grid gap-3 sm:grid-cols-2 xl:flex xl:items-stretch xl:gap-0" aria-label={label}>
      {steps.map((s, i) => {
        const prev = steps[i - 1]
        const rate = prev && prev.value > 0 ? s.value / prev.value : null
        return (
          <li key={s.label} className="flex min-w-0 items-stretch xl:flex-1">
            {rate !== null && (
              <div className="hidden w-24 shrink-0 flex-col items-center justify-center px-1 text-center xl:flex">
                <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-bold text-white tabular-nums">
                  {rate > 1 ? `${rate.toFixed(1)}×` : `${rate >= 0.1 ? (rate * 100).toFixed(0) : (rate * 100).toFixed(1)}%`}
                </span>
                <span className="mt-1 text-[11px] leading-tight text-zinc-500">{s.hint ?? 'move on'}</span>
                <svg width="60" height="10" className="mt-1 text-zinc-300" aria-hidden>
                  <path d="M0 5 H54 M48 1 L54 5 L48 9" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
            )}
            <div className={`relative flex min-w-0 flex-1 flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white ${GRAD[i] ?? GRAD[3]}`}>
              <span className="pointer-events-none absolute -top-6 -right-6 h-20 w-20 rounded-full bg-white/15" />
              <p className="relative text-xs font-medium text-white/80">{s.label}</p>
              <p className="relative mt-3 text-2xl font-bold tracking-tight tabular-nums">{compact(s.value)}</p>
              {rate !== null && (
                <p className="relative mt-1 text-[11px] text-white/85 xl:hidden">
                  {rate > 1 ? `${rate.toFixed(1)}×` : `${(rate * 100).toFixed(rate >= 0.1 ? 0 : 1)}%`} {s.hint ?? ''}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* ─── This week vs last week ─── */

export function CompareBars({ now, before, unit, label }: { now: number; before: number; unit?: Unit; label: string }) {
  const format = fmtUnit(unit, false)
  const max = Math.max(now, before, 1e-9)
  return (
    <div className="space-y-1" role="img" aria-label={`${label}: this week ${format(now)}, the week before ${format(before)}`}>
      {[
        ['This week', now, VIZ.accent],
        ['Before', before, '#d4d4d8'],
      ].map(([k, v, col]) => (
        <div key={k as string} className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span className="w-14 shrink-0 whitespace-nowrap">{k}</span>
          <div className="h-1.5 flex-1 rounded-full bg-zinc-100">
            <div className="h-full rounded-full" style={{ width: `${((v as number) / max) * 100}%`, background: col as string }} />
          </div>
        </div>
      ))}
    </div>
  )
}
