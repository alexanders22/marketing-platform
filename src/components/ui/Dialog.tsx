'use client'

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { AlertTriangle, CircleHelp, Info } from 'lucide-react'

// In-app replacements for window.confirm / window.alert: call ask(), confirmDialog()
// or alertDialog() from any client component; <DialogHost /> (in the root
// layout) shows one dialog at a time and resolves with the button picked.

export type Choice = { id: string; label: ReactNode; tone?: 'primary' | 'danger' | 'plain' }
type Request = {
  title: ReactNode
  body?: ReactNode
  tone?: 'default' | 'danger' | 'info'
  choices: Choice[]
  resolve: (id: string | null) => void
  // Tells two dialogs with the same text apart (tests, screen readers).
  seq: number
}

let queue: Request[] = []
// Unique across page loads, not only within one.
let seq = Date.now()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
const current = () => queue[0] ?? null
function settle(req: Request, id: string | null) {
  queue = queue.filter((r) => r !== req)
  req.resolve(id)
  emit()
}

// Resolves with the id of the button picked, or null when dismissed.
export function ask(req: Omit<Request, 'resolve' | 'seq'>): Promise<string | null> {
  return new Promise((resolve) => {
    queue = [...queue, { ...req, resolve, seq: ++seq }]
    emit()
  })
}

export async function confirmDialog(
  title: ReactNode,
  { body, confirm = 'OK', danger = false }: { body?: ReactNode; confirm?: string; danger?: boolean } = {},
): Promise<boolean> {
  const id = await ask({
    title,
    body,
    tone: danger ? 'danger' : 'default',
    choices: [
      { id: 'cancel', label: 'Cancel', tone: 'plain' },
      { id: 'ok', label: confirm, tone: danger ? 'danger' : 'primary' },
    ],
  })
  return id === 'ok'
}

export async function alertDialog(title: ReactNode, body?: ReactNode): Promise<void> {
  await ask({ title, body, tone: 'info', choices: [{ id: 'ok', label: 'OK', tone: 'primary' }] })
}

const BUTTON = {
  primary: 'bg-zinc-900 text-white hover:bg-zinc-800',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  plain: 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
}
const ICON = {
  default: { icon: CircleHelp, cls: 'bg-violet-50 text-violet-600' },
  danger: { icon: AlertTriangle, cls: 'bg-red-50 text-red-600' },
  info: { icon: Info, cls: 'bg-sky-50 text-sky-600' },
}

export function DialogHost() {
  const req = useSyncExternalStore(subscribe, current, () => null)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!req || !d) return
    if (!d.open) d.showModal()
    // Enter takes the main (last) button — except when it deletes or disconnects.
    d.querySelector<HTMLButtonElement>(`[data-choice="${req.tone === 'danger' ? 0 : req.choices.length - 1}"]`)?.focus()
  }, [req])

  const close = (id: string | null) => {
    if (!req) return
    ref.current?.close()
    settle(req, id)
  }

  if (!req) return null
  const { icon: Icon, cls } = ICON[req.tone ?? 'default']
  return (
    <dialog
      ref={ref}
      data-request={req.seq}
      aria-labelledby="app-dialog-title"
      onCancel={(e) => (e.preventDefault(), close(null))}
      onClick={(e) => e.target === e.currentTarget && close(null)}
      className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-2xl [color-scheme:light] bg-white p-0 text-zinc-900 shadow-[0_30px_80px_-20px_rgba(16,16,32,0.45)] backdrop:bg-zinc-950/40 backdrop:backdrop-blur-[2px] open:animate-[dialog-in_160ms_ease-out]"
    >
      <div className="flex gap-4 p-5">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${cls}`}>
          <Icon size={19} />
        </span>
        <div className="min-w-0 flex-1 pt-1">
          <h2 id="app-dialog-title" className="text-base font-semibold text-balance">
            {req.title}
          </h2>
          {req.body && <div className="mt-1.5 text-sm text-zinc-600">{req.body}</div>}
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3 sm:flex-row sm:justify-end">
        {req.choices.map((c, i) => (
          <button key={c.id} type="button" data-choice={i} onClick={() => close(c.id)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${BUTTON[c.tone ?? 'plain']}`}>
            {c.label}
          </button>
        ))}
      </div>
    </dialog>
  )
}
