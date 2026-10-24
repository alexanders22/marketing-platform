'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { connectTelegram, disconnectTelegram, telegramLinks } from '../actions'

const button = 'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60'

// Links a Telegram chat for alerts: the company's shared one, or (with
// operatorId) one operator's own — the link can be sent to that person.
export function TelegramConnect({ name, canManage, operatorId, label = 'Telegram alerts' }: { name: string | null; canManage: boolean; operatorId?: string; label?: string }) {
  const router = useRouter()
  const [links, setLinks] = useState<{ person?: string; group?: string }>()
  const [err, setErr] = useState<string>()
  const [pending, start] = useTransition()
  if (name)
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        {label}: <b>{name}</b>
        {canManage && (
          <button type="button" className="text-xs text-zinc-500 underline" onClick={() => start(async () => (await disconnectTelegram(operatorId), router.refresh()))}>
            Disconnect
          </button>
        )}
      </p>
    )
  return (
    <div className="space-y-2 text-sm" role="group" aria-label={label}>
      <p className="font-medium">{label}</p>
      {!links ? (
        <button
          type="button"
          disabled={!canManage || pending}
          className={button}
          onClick={() =>
            start(async () => {
              const r = await telegramLinks(operatorId)
              if (r.error) setErr(r.error)
              else setLinks(r)
            })
          }
        >
          Connect Telegram
        </button>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-zinc-600">
          <li>
            Open{' '}
            <a href={links.person} target="_blank" rel="noreferrer" className="text-indigo-600">
              the Loudpilot bot
            </a>{' '}
            and press Start
            {operatorId ? (
              <> (or send this link to the operator: <code className="rounded bg-zinc-100 px-1 text-xs break-all">{links.person}</code>)</>
            ) : (
              <>
                {' '}
                — or{' '}
                <a href={links.group} target="_blank" rel="noreferrer" className="text-indigo-600">
                  add it to your team’s group
                </a>
              </>
            )}
            .
          </li>
          <li>
            <button
              type="button"
              disabled={pending}
              className={button}
              onClick={() =>
                start(async () => {
                  const r = await connectTelegram(operatorId)
                  if (r.error) setErr(r.error)
                  else router.refresh()
                })
              }
            >
              {pending && <Loader2 size={15} className="animate-spin" />} Start was pressed — check
            </button>
          </li>
        </ol>
      )}
      {err && <p className="text-red-600">{err}</p>}
    </div>
  )
}
