'use client'

import { Children, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

// A long list shows its first rows and a "Load more" button for the rest.
// The rows are rendered on the server and passed as children; `as` says
// what the button must be wrapped in to sit inside the list: an <li> in a
// <ul>, a <tr> in a <tbody>, or a full-width cell in a grid.
export function ShowMore({
  children,
  first = 10,
  step = 10,
  as = 'div',
  colSpan = 1,
}: {
  children: ReactNode
  first?: number
  step?: number
  as?: 'li' | 'tr' | 'div'
  colSpan?: number
}) {
  const items = Children.toArray(children)
  const [shown, setShown] = useState(first)
  const left = items.length - shown
  const button =
    left > 0 ? (
      <button
        type="button"
        onClick={() => setShown((n) => n + step)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        <ChevronDown size={15} /> Load more <span className="text-zinc-400">({left})</span>
      </button>
    ) : null
  return (
    <>
      {items.slice(0, shown)}
      {button &&
        (as === 'tr' ? (
          <tr>
            <td colSpan={colSpan} className="px-4 py-3 text-center">
              {button}
            </td>
          </tr>
        ) : as === 'li' ? (
          <li className="flex justify-center px-4 py-3">{button}</li>
        ) : (
          <div className="col-span-full flex justify-center py-3">{button}</div>
        ))}
    </>
  )
}
