'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import { createToken, revokeToken } from './actions'
import { confirmDialog } from '@/components/ui/Dialog'

export function NewToken() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [token, setToken] = useState<string>()
  const [error, setError] = useState<string>()
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name, e.g. Claude Code on my laptop"
          aria-label="Token name"
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
        />
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(undefined)
              setCopied(false)
              const res = await createToken(name)
              if (res.error) return setError(res.error)
              setToken(res.token)
              setName('')
              router.refresh()
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          <KeyRound size={15} /> Create token
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {token && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">Copy it now — Loudpilot will not show it again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5 font-mono text-xs ring-1 ring-amber-200" data-testid="new-token">
              {token}
            </code>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(token)
                  setCopied(true)
                } catch {}
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function RevokeButton({ id, label }: { id: string; label: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      disabled={pending}
      onClick={async () =>
        (await confirmDialog(`Disconnect ${label}?`, { body: 'It stops working right away.', confirm: 'Disconnect', danger: true })) &&
        start(async () => {
          await revokeToken(id)
          router.refresh()
        })
      }
      className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      aria-label={`Revoke ${label}`}
    >
      {pending ? '…' : 'Revoke'}
    </button>
  )
}
