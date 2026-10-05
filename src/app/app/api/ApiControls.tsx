'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Copy, Eye, KeyRound } from 'lucide-react'
import { createApiKey, revokeApiKey, saveWebhook } from './actions'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
        } catch {}
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function NewApiKey() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [key, setKey] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name, e.g. Our CRM (production)"
          aria-label="API key name"
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
        />
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(undefined)
              const res = await createApiKey(name)
              if (res.error) return setError(res.error)
              setKey(res.key)
              setName('')
              router.refresh()
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          <KeyRound size={15} /> Create API key
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {key && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">Copy it now — Loudpilot will not show it again. Keep it on your server, never in a browser or app.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5 font-mono text-xs ring-1 ring-amber-200" data-testid="new-api-key">
              {key}
            </code>
            <CopyButton text={key} />
          </div>
        </div>
      )}
    </div>
  )
}

export function RevokeKey({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      disabled={pending}
      aria-label={`Revoke ${name}`}
      onClick={() =>
        confirm(`Revoke "${name}"? Requests with it stop working right away.`) &&
        start(async () => {
          await revokeApiKey(id)
          router.refresh()
        })
      }
      className="rounded-lg px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      Revoke
    </button>
  )
}

export function WebhookForm({ url, secret }: { url: string; secret: string | null }) {
  const router = useRouter()
  const [value, setValue] = useState(url)
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>()
  const [show, setShow] = useState(false)
  const [pending, start] = useTransition()
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://your-app.com/hooks/loudpilot"
          aria-label="Webhook URL"
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
        />
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(await saveWebhook(value))
              router.refresh()
            })
          }
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
        >
          Save
        </button>
      </div>
      {msg?.error && <p className="text-sm text-red-600">{msg.error}</p>}
      {msg?.ok && <p className="text-sm text-emerald-700">{msg.ok}</p>}
      {secret && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Signing secret</span>
          <code className="min-w-0 flex-1 truncate rounded bg-zinc-50 px-2 py-1.5 font-mono text-xs ring-1 ring-zinc-200">
            {show ? secret : 'whsec_' + '•'.repeat(24)}
          </code>
          <button type="button" onClick={() => setShow(!show)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium">
            <Eye size={13} /> {show ? 'Hide' : 'Show'}
          </button>
          <CopyButton text={secret} />
        </div>
      )}
    </div>
  )
}
