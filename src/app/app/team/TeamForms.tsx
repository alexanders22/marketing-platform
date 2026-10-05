'use client'

import { useActionState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import type { MemberRole } from '@prisma/client'
import { inviteMember, removeMember, revokeInvite, setRole } from './actions'

function Send({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button disabled={disabled || pending} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
      {pending ? 'Sending…' : 'Send invite'}
    </button>
  )
}

export function InviteForm({ disabled, limit }: { disabled: boolean; limit: number }) {
  const [state, action] = useActionState(inviteMember, undefined)
  return (
    <form action={action} className="rounded-xl border border-zinc-200 p-4">
      <h2 className="font-semibold">Invite a teammate</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="name@company.com"
          aria-label="Teammate email"
          disabled={disabled}
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 disabled:bg-zinc-50"
        />
        <select name="role" defaultValue="EDITOR" aria-label="Role" disabled={disabled} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
          <option value="EDITOR">Editor</option>
          <option value="ADMIN">Admin</option>
        </select>
        <Send disabled={disabled} />
      </div>
      {disabled && <p className="mt-2 text-sm text-zinc-500">All {limit} seats are taken.</p>}
      {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm text-emerald-700">{state.ok}</p>}
    </form>
  )
}

export function MemberActions({
  id,
  role,
  label,
  canEdit,
  canLeave,
  name,
}: {
  id: string
  role: MemberRole
  label: string
  canEdit: boolean
  canLeave: boolean
  name: string
}) {
  const [pending, start] = useTransition()
  if (!canEdit && !canLeave) return <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">{label}</span>
  return (
    <span className="flex items-center gap-2">
      {canEdit ? (
        <select
          value={role}
          aria-label={`Role of ${name}`}
          disabled={pending}
          onChange={(e) => start(() => setRole(id, e.target.value as MemberRole))}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
        >
          <option value="EDITOR">Editor</option>
          <option value="ADMIN">Admin</option>
        </select>
      ) : (
        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">{label}</span>
      )}
      <button
        disabled={pending}
        onClick={() => {
          if (confirm(canLeave ? 'Leave this team?' : `Remove ${name} from the team?`)) start(() => removeMember(id))
        }}
        className="rounded-lg px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {canLeave ? 'Leave' : 'Remove'}
      </button>
    </span>
  )
}

export function RevokeButton({ id, email }: { id: string; email: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      disabled={pending}
      aria-label={`Cancel invitation for ${email}`}
      onClick={() => start(() => revokeInvite(id))}
      className="rounded-lg px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
    >
      Cancel
    </button>
  )
}
