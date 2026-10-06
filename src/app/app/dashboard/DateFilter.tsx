'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CalendarRange, ChevronDown } from 'lucide-react'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Ranges counted from the viewer's today (only on click: render stays pure).
function preset(id: 'month' | 'lastMonth' | 'year' | 'lastYear') {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (id) {
    case 'month':
      return { from: ymd(new Date(y, m, 1)), to: ymd(now) }
    case 'lastMonth':
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) }
    case 'year':
      return { from: ymd(new Date(y, 0, 1)), to: ymd(now) }
    case 'lastYear':
      return { from: ymd(new Date(y - 1, 0, 1)), to: ymd(new Date(y - 1, 11, 31)) }
  }
}

const PRESETS = [
  ['month', 'This month'],
  ['lastMonth', 'Last month'],
  ['year', 'This year'],
  ['lastYear', 'Last year'],
] as const

// Period of the dashboard: the last 7 / 30 / 90 days, or any range up to a year.
export function DateFilter({ period, range }: { period: number; range: { from: string; to: string } | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(range?.from ?? '')
  const [to, setTo] = useState(range?.to ?? '')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const go = (r: { from: string; to: string }) => {
    setOpen(false)
    router.push(`/app/dashboard?from=${r.from}&to=${r.to}`)
  }
  const valid = from && to && from <= to

  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav className="flex rounded-lg bg-zinc-100 p-1 text-sm" aria-label="Period">
        {[7, 30, 90].map((n) => (
          <Link
            key={n}
            href={`/app/dashboard?days=${n}`}
            aria-current={!range && n === period ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 font-medium ${!range && n === period ? 'bg-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
          >
            {n} days
          </Link>
        ))}
      </nav>
      <div ref={box} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ring-1 ${range ? 'bg-zinc-900 text-white ring-zinc-900' : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50'}`}
        >
          <CalendarRange size={15} />
          {range ? `${range.from} – ${range.to}` : 'Dates'}
          <ChevronDown size={14} />
        </button>
        {open && (
          <div role="dialog" aria-label="Choose dates" className="absolute right-0 z-30 mt-2 w-72 rounded-xl bg-white p-3 shadow-xl ring-1 ring-black/10">
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map(([id, label]) => (
                <button key={id} type="button" onClick={() => go(preset(id))} className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zinc-100">
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 border-t border-zinc-100 pt-3">
              <p className="text-xs font-semibold text-zinc-500">Custom range</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs text-zinc-500">
                  From
                  <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900" />
                </label>
                <label className="text-xs text-zinc-500">
                  To
                  <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900" />
                </label>
              </div>
              <button
                type="button"
                disabled={!valid}
                onClick={() => go({ from, to })}
                className="mt-2 w-full rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
              >
                Apply
              </button>
              <p className="mt-1.5 text-[11px] text-zinc-500">Compared with the same number of days just before. Up to one year.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
