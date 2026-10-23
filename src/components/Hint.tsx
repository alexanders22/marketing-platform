'use client'

import { useId, useState } from 'react'

// A "?" next to a number: a plain-words explanation on hover, focus or tap.
export function Hint({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="grid h-4 w-4 place-items-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-600 hover:bg-zinc-300"
      >
        ?
      </button>
      {open && (
        <span role="tooltip" id={id} className="absolute top-full left-1/2 z-40 mt-1.5 w-64 -translate-x-1/2 rounded-lg bg-zinc-900 px-3 py-2 text-left text-xs leading-snug font-normal text-white shadow-lg">
          {text}
        </span>
      )}
    </span>
  )
}
