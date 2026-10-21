'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Headset, Plus, Trash2 } from 'lucide-react'
import { confirmDialog } from '@/components/ui/Dialog'
import { addOperator, removeOperator, updateOperator } from '../actions'
import { TelegramConnect } from './TelegramConnect'

export type OperatorRow = { id: string; userId: string; name: string; login: string; email: string | null; active: boolean; telegram: string | null; open: number }
export type Member = { userId: string; name: string; email: string }

const input = 'w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 disabled:bg-zinc-50'

// Team members who answer handed-over chats. Changes save at once (not with
// the form's Save): managers edit anyone, an operator their own row.
export function Operators({ operators, members, canManage, me }: { operators: OperatorRow[]; members: Member[]; canManage: boolean; me: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string>()
  const [pickUser, setPickUser] = useState('')
  const free = members.filter((m) => !operators.some((o) => o.userId === m.userId))
  const run = (f: () => Promise<{ error?: string }>) =>
    start(async () => {
      const r = await f()
      setErr(r.error)
      if (!r.error) router.refresh()
    })

  return (
    <div className="space-y-3">
      <div>
        <p className="flex items-center gap-2 font-medium">
          <Headset size={16} /> Operators
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Each hand-over goes to one operator, in turn: someone who is free (no chat of theirs with a message in the last 30 minutes) — or, when everyone is
          busy, whoever has the fewest chats. Only that operator is alerted, on their own e-mail and Telegram. No operators: the alerts below go to everyone.
        </p>
      </div>

      {operators.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200" aria-label="Operators">
          {operators.map((o) => {
            const editable = canManage || o.userId === me
            return (
              <li key={o.id} className="space-y-3 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{o.name}</span>
                    {o.userId === me && <span className="ml-1.5 text-xs text-zinc-400">(you)</span>}
                    <span className="block text-xs text-zinc-500">
                      {o.open > 0 ? `Busy · ${o.open} active chat${o.open === 1 ? '' : 's'}` : 'Free'}
                    </span>
                  </span>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      key={String(o.active)}
                      type="checkbox"
                      defaultChecked={o.active}
                      disabled={!editable || pending}
                      onChange={(e) => run(() => updateOperator(o.id, { active: e.target.checked }))}
                    />
                    Takes new chats
                  </label>
                  {canManage && (
                    <button
                      type="button"
                      aria-label={`Remove ${o.name}`}
                      disabled={pending}
                      onClick={async () => {
                        if (await confirmDialog(`Remove ${o.name} as an operator?`, { body: 'Their chats stay, without an operator.', confirm: 'Remove', danger: true }))
                          run(() => removeOperator(o.id))
                      }}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="font-medium">E-mail alerts</span>
                    <input
                      key={o.email ?? ''}
                      aria-label={`${o.name} e-mail alerts`}
                      className={`${input} mt-1`}
                      disabled={!editable || pending}
                      defaultValue={o.email ?? ''}
                      placeholder={o.login}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== (o.email ?? '')) run(() => updateOperator(o.id, { email: e.target.value }))
                      }}
                    />
                  </label>
                  <TelegramConnect name={o.telegram} canManage={editable} operatorId={o.id} label="Telegram" />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {canManage &&
        (free.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Team member"
              value={pickUser}
              onChange={(e) => setPickUser(e.target.value)}
              className="w-full min-w-0 rounded-lg border border-zinc-200 px-2 py-2 text-sm sm:w-auto sm:max-w-sm"
            >
              <option value="">Choose a team member…</option>
              {free.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name || m.email} ({m.email})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!pickUser || pending}
              onClick={() =>
                run(async () => {
                  const r = await addOperator(pickUser)
                  if (!r.error) setPickUser('')
                  return r
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
            >
              <Plus size={15} /> Add operator
            </button>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            Everyone on the team is an operator. Invite more people in{' '}
            <Link href="/app/team" className="text-indigo-600">
              Team
            </Link>
            .
          </p>
        ))}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  )
}
