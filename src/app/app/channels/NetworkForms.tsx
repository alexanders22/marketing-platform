'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { connectTelegram, setPinterestBoard } from './network-actions'

export function TelegramConnect({ platformBot }: { platformBot: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState('')
  const [token, setToken] = useState('')
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>()
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="shrink-0 rounded-lg bg-[#26A5E4] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1f95cf]">
        Connect
      </button>
    )
  return (
    <form
      className="mt-4 w-full space-y-3 rounded-xl bg-zinc-50 p-4 text-sm"
      aria-label="Connect Telegram"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const r = await connectTelegram({ channel, botToken: token })
          setMsg(r.error ? { error: r.error } : { ok: `Connected ${r.name}.` })
          if (!r.error) {
            setChannel('')
            setToken('')
            router.refresh()
          }
        })
      }}
    >
      <ol className="list-decimal space-y-1 pl-5 text-zinc-600">
        {platformBot ? (
          <li>
            In your channel → Administrators → Add admin: <b>@{platformBot}</b>, with &ldquo;Post messages&rdquo;.
          </li>
        ) : (
          <li>
            Create a bot with <b>@BotFather</b> (/newbot) and copy its token.
          </li>
        )}
        {!platformBot && <li>Add the bot to your channel as an admin with &ldquo;Post messages&rdquo;.</li>}
        <li>Enter the channel below.</li>
      </ol>
      <label className="block">
        <span className="text-xs text-zinc-500">Channel</span>
        <input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="@yourchannel or t.me/yourchannel" className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2" />
      </label>
      <label className="block">
        <span className="text-xs text-zinc-500">{platformBot ? 'Your own bot token (optional — to post as your bot)' : 'Bot token'}</span>
        <input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoComplete="off" placeholder="123456:ABC…" className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2" />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-[#26A5E4] px-4 py-2 font-semibold text-white hover:bg-[#1f95cf] disabled:opacity-50">
          {pending ? 'Checking…' : 'Connect channel'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:underline">
          Cancel
        </button>
        {msg?.ok && <span className="text-emerald-700">{msg.ok}</span>}
      </div>
      {msg?.error && <p className="text-red-600">{msg.error}</p>}
    </form>
  )
}

export function BoardPicker({ accountId, boards, current }: { accountId: string; boards: { id: string; name: string }[]; current: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (!boards.length) return <span className="text-xs text-amber-700">No boards — create one on Pinterest, then reconnect</span>
  return (
    <select
      aria-label="Pinterest board"
      disabled={pending}
      value={current ?? ''}
      onChange={(e) =>
        start(async () => {
          await setPinterestBoard(accountId, e.target.value)
          router.refresh()
        })
      }
      className="max-w-[12rem] rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs"
    >
      {boards.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  )
}
