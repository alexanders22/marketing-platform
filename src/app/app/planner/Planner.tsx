'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Month grid starting on Monday. Scheduled posts will be placed into the
// day cells once publishing exists.
export function Planner() {
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7
    const start = new Date(first)
    start.setDate(first.getDate() - offset)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [cursor])

  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1))

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-xl font-semibold">
          {cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
        </h1>
        <div className="flex items-center gap-1">
          <button onClick={() => move(-1)} className="rounded-lg p-1.5 hover:bg-zinc-100" aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="rounded-lg border border-zinc-200 px-3 py-1 text-sm font-medium hover:bg-zinc-50"
          >
            Today
          </button>
          <button onClick={() => move(1)} className="rounded-lg p-1.5 hover:bg-zinc-100" aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>
        <Link
          href="/app/create"
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          <Plus size={16} /> Create post
        </Link>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7 overflow-hidden rounded-xl border border-zinc-200">
          {DAYS.map((d) => (
            <div key={d} className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-500">
              {d}
            </div>
          ))}
          {cells.map((d, i) => {
            const inMonth = d.getMonth() === cursor.getMonth()
            const isToday = same(d, today)
            return (
              <Link
                key={i}
                href="/app/create"
                className={`group relative min-h-28 border-zinc-200 p-2 transition hover:bg-zinc-50 ${
                  i % 7 !== 6 ? 'border-r' : ''
                } ${i < 35 ? 'border-b' : ''} ${inMonth ? '' : 'bg-zinc-50/60 text-zinc-400'}`}
              >
                <span
                  className={`inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs ${
                    isToday ? 'bg-zinc-900 font-semibold text-white' : ''
                  }`}
                >
                  {d.getDate()}
                </span>
                <Plus
                  size={16}
                  className="absolute top-2 right-2 text-zinc-400 opacity-0 transition group-hover:opacity-100"
                />
              </Link>
            )
          })}
        </div>
      </div>
      <p className="mt-4 text-sm text-zinc-500">
        Nothing scheduled yet. Create a post — scheduling and publishing arrive once your channels are connected.
      </p>
    </div>
  )
}
