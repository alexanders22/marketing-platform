'use client'

import { useActionState, useState, useTransition, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import type { MemberRole } from '@prisma/client'
import type { AdminState } from './actions'
import { confirmDialog } from '@/components/ui/Dialog'

type Action = (state: AdminState, f: FormData) => Promise<AdminState>

function Submit({ children, tone }: { children: ReactNode; tone: 'dark' | 'danger' | 'light' }) {
  const { pending } = useFormStatus()
  const cls = {
    dark: 'bg-zinc-900 text-white hover:bg-zinc-800',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    light: 'border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50',
  }[tone]
  return (
    <button disabled={pending} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${cls}`}>
      {pending ? 'Working…' : children}
    </button>
  )
}

// A form bound to an admin action, with its result shown under the button.
export function ActionForm({
  action,
  submit,
  tone = 'dark',
  children,
  className = '',
}: {
  action: Action
  submit: string
  tone?: 'dark' | 'danger' | 'light'
  children?: ReactNode
  className?: string
}) {
  const [state, formAction] = useActionState(action, undefined)
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Submit tone={tone}>{submit}</Submit>
        {state?.ok && (
          <p role="status" className="text-sm text-emerald-700">
            {state.ok}
          </p>
        )}
        {state?.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>
    </form>
  )
}

// Destructive: the button only arms once the exact name is typed.
export function ConfirmDelete({ action, expected, what }: { action: Action; expected: string; what: string }) {
  const [typed, setTyped] = useState('')
  const [state, formAction] = useActionState(action, undefined)
  return (
    <form action={formAction}>
      <label className="block text-sm text-zinc-600">
        Type <b className="font-semibold text-zinc-900">{expected}</b> to delete {what}
        <input
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          aria-label={`Type ${expected} to delete the ${what}`}
          className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-red-400"
        />
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button
          disabled={typed !== expected}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
        >
          Delete {what}
        </button>
        {state?.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      </div>
    </form>
  )
}

// One-click action (pause, block, open…): a plain button, optionally asking first.
export function ActionButton({
  action,
  children,
  confirm,
  tone = 'light',
}: {
  action: () => Promise<void>
  children: ReactNode
  confirm?: string
  tone?: 'dark' | 'danger' | 'light'
}) {
  const [pending, start] = useTransition()
  const cls = {
    dark: 'bg-zinc-900 text-white hover:bg-zinc-800',
    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
    light: 'border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50',
  }[tone]
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        if (confirm && !(await confirmDialog(confirm, { confirm: 'Continue', danger: tone === 'danger' }))) return
        start(() => action())
      }}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${cls}`}
    >
      {pending ? 'Working…' : children}
    </button>
  )
}

export function RoleSelect({ value, onChange, label }: { value: MemberRole; onChange: (r: MemberRole) => Promise<void>; label: string }) {
  const [role, setRole] = useState(value)
  const [pending, start] = useTransition()
  return (
    <select
      aria-label={label}
      value={role}
      disabled={pending}
      onChange={(e) => {
        const r = e.target.value as MemberRole
        setRole(r)
        start(() => onChange(r))
      }}
      className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm"
    >
      <option value="OWNER">Owner</option>
      <option value="ADMIN">Admin</option>
      <option value="EDITOR">Editor</option>
    </select>
  )
}
