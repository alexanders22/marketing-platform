'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Loader2, Paperclip, RefreshCw, Send, Sparkles } from 'lucide-react'
import { SiFacebook, SiInstagram } from 'react-icons/si'
import { LocalTime, useIsClient } from '@/components/LocalTime'
import { draftReply, openConversation, refreshInbox, reply } from './actions'

export function NetIcon({ network, size = 14 }: { network: string; size?: number }) {
  return network === 'INSTAGRAM' ? <SiInstagram size={size} color="#E4405F" aria-label="Instagram" /> : <SiFacebook size={size} color="#1877F2" aria-label="Messenger" />
}

// "14:05" today, "3 Oct" before.
export function When({ iso }: { iso: string }) {
  const client = useIsClient()
  if (!client) return null
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return <>{today ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>
}

export function RefreshButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  // New messages arrive in the background every 2 minutes; show them.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(t)
  }, [router])
  return (
    <button
      onClick={() => start(() => refreshInbox())}
      disabled={pending}
      aria-label="Check for new messages"
      className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-60"
    >
      <RefreshCw size={15} className={pending ? 'animate-spin' : ''} />
    </button>
  )
}

// Outside the component: render must stay pure.
const olderThanADay = (iso: string) => Date.now() - Date.parse(iso) > 24 * 3600_000

type Msg = { id: string; fromMe: boolean; text: string; at: string; attachments: { type: string; url: string }[] }

export function Thread({
  conversation: c,
  messages,
}: {
  conversation: { id: string; name: string; network: string; account: string; unread: number; canReply: boolean }
  messages: Msg[]
}) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()
  const [sending, startSend] = useTransition()
  const [drafting, startDraft] = useTransition()
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (c.unread > 0) openConversation(c.id)
  }, [c.id, c.unread])
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [messages.length])

  const lastIn = [...messages].reverse().find((m) => !m.fromMe)
  const client = useIsClient()
  const late = client && lastIn ? olderThanADay(lastIn.at) : false

  const send = () =>
    startSend(async () => {
      setError(undefined)
      const res = await reply(c.id, text)
      if (res.error) return setError(res.error)
      setText('')
      router.refresh()
    })

  const draft = () =>
    startDraft(async () => {
      setError(undefined)
      const res = await draftReply(c.id)
      if (res.error) return setError(res.error)
      setText(res.text ?? '')
      router.refresh()
    })

  return (
    <>
      <header className="flex items-center gap-3 border-b border-zinc-200 px-5 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-700">
          {c.name.replace(/^@/, '').slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{c.name}</h2>
          <p className="flex items-center gap-1.5 text-xs text-zinc-500">
            <NetIcon network={c.network} size={11} /> {c.network === 'INSTAGRAM' ? 'Instagram' : 'Messenger'} · {c.account}
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto bg-zinc-50/60 px-5 py-4" aria-label="Messages">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                m.fromMe ? 'rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md bg-white text-zinc-900 ring-1 ring-zinc-200'
              }`}
            >
              {m.text}
              {m.attachments.map((a, i) =>
                a.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={a.url} alt="" className="mt-1 max-h-60 rounded-lg" />
                ) : (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 underline">
                    <Paperclip size={12} /> {a.type}
                  </a>
                ),
              )}
              <p className={`mt-0.5 text-[10px] ${m.fromMe ? 'text-indigo-200' : 'text-zinc-400'}`}>
                <LocalTime iso={m.at} options={{ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }} />
              </p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>

      <div className="border-t border-zinc-200 p-3">
        {!c.canReply ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Reconnect Meta and allow messages to reply from Loudpilot.</p>
        ) : (
          <>
            {late && (
              <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Their last message is older than 24 hours — Meta may refuse a reply from here. Meta Business Suite can still answer.
              </p>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) send()
              }}
              placeholder={`Reply to ${c.name}…`}
              aria-label="Reply"
              className="min-h-20 w-full resize-y rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
            {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                onClick={draft}
                disabled={drafting || sending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-60"
              >
                {drafting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Draft with AI · 1 credit
              </button>
              <button
                onClick={send}
                disabled={sending || !text.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
