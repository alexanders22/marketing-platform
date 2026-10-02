'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// Click-to-open panel anchored to its trigger. Closes on outside click and Esc.
export function Popover({
  trigger,
  children,
  align = 'left',
  side = 'bottom',
  tooltip,
  width = 'w-72',
}: {
  trigger: (open: boolean) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  side?: 'top' | 'bottom'
  tooltip?: string
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="group/pop relative">
      <div onClick={() => setOpen((v) => !v)}>{trigger(open)}</div>
      {tooltip && !open && (
        <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden rounded-md bg-zinc-900 px-2 py-1 text-xs whitespace-nowrap text-white group-hover/pop:block">
          {tooltip}
        </span>
      )}
      {open && (
        <div
          className={`absolute z-40 ${width} rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl ${
            side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
          } ${align === 'left' ? 'left-0' : 'right-0'}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-zinc-500">{children}</p>
}

export function MenuItem({
  icon,
  children,
  checked,
  hint,
  onClick,
}: {
  icon?: ReactNode
  children: ReactNode
  checked?: boolean
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-zinc-100"
    >
      {icon && <span className="shrink-0 text-emerald-600">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-zinc-800">{children}</span>
        {hint && <span className="block truncate text-xs text-zinc-500">{hint}</span>}
      </span>
      {checked && (
        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-zinc-900" aria-hidden>
          <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div role="dialog" aria-label={title} className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100" aria-label="Close">
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
