'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/format'

// Small dependency-free SVG charts for the dashboard.

const W = 640
const H = 200
const PAD = { top: 12, right: 8, bottom: 4, left: 8 }

const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

// Bars for one series, an optional line for a second one (own scale).
export function DailyChart({
  data,
  bar,
  line,
  barCurrency,
  label,
}: {
  data: { date: string; bar: number; line?: number }[]
  bar: string
  line?: string
  // Bars are money in this currency (else plain counts).
  barCurrency?: string | null
  label: string
}) {
  const formatBar = (v: number) => (barCurrency ? formatMoney(v, barCurrency) : v.toLocaleString('en-US'))
  const formatLine = (v: number) => v.toLocaleString('en-US')
  const [hover, setHover] = useState<number | null>(null)
  const n = data.length
  const maxBar = Math.max(1, ...data.map((d) => d.bar))
  const maxLine = Math.max(1, ...data.map((d) => d.line ?? 0))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const step = innerW / Math.max(1, n)
  const bw = Math.max(2, step * 0.62)
  const x = (i: number) => PAD.left + i * step + step / 2
  const yBar = (v: number) => PAD.top + innerH - (v / maxBar) * innerH
  const yLine = (v: number) => PAD.top + innerH - (v / maxLine) * innerH
  const path = line ? data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yLine(d.line ?? 0).toFixed(1)}`).join(' ') : ''
  const ticks = n <= 7 ? data.map((_, i) => i) : [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1]
  const h = hover !== null ? data[hover] : null
  const empty = data.every((d) => d.bar === 0 && !d.line)

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> {bar}
        </span>
        {line && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-emerald-500" /> {line}
          </span>
        )}
        {h && (
          <span className="ml-auto text-zinc-700">
            <b>{short(h.date)}</b> · {bar} {formatBar(h.bar)}
            {line && ` · ${line} ${formatLine(h.line ?? 0)}`}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-48 w-full"
        role="img"
        aria-label={label}
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + innerH * (1 - f)}
            y2={PAD.top + innerH * (1 - f)}
            vectorEffect="non-scaling-stroke"
            className="stroke-zinc-100"
          />
        ))}
        {data.map((d, i) => (
          <g key={d.date} onMouseEnter={() => setHover(i)}>
            <rect x={x(i) - step / 2} y={PAD.top} width={step} height={innerH} fill="transparent" />
            <rect
              x={x(i) - bw / 2}
              y={yBar(d.bar)}
              width={bw}
              height={Math.max(0, PAD.top + innerH - yBar(d.bar))}
              rx={Math.min(3, bw / 3)}
              className={hover === i ? 'fill-indigo-600' : 'fill-indigo-400'}
            />
          </g>
        ))}
        {line && <path d={path} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" className="pointer-events-none stroke-emerald-500" />}
      </svg>
      {/* Labels in HTML so the stretched SVG does not distort the text. */}
      <div className="relative h-4 text-[11px] text-zinc-400">
        {ticks.map((i) => (
          <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(x(i) / W) * 100}%` }}>
            {short(data[i].date)}
          </span>
        ))}
      </div>
      {empty && <p className="absolute inset-0 grid place-items-center text-sm text-zinc-400">No activity in this period</p>}
    </div>
  )
}

export function Sparkline({ values, className = 'stroke-indigo-500' }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values)
  const w = 96
  const h = 28
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-24" aria-hidden>
      <path d={d} fill="none" strokeWidth={1.5} className={className} />
    </svg>
  )
}
