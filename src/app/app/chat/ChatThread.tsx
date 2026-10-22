'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Bot, Database, Loader2, RefreshCw, Send, ShieldCheck } from 'lucide-react'
import { LocalTime } from '@/components/LocalTime'
import { changeStatus, markChatRead, reassignChat, sendTeamReply } from './actions'

const TIME: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }

// New visitor messages show up without reloading.
export function LiveChats() {
  const router = useRouter()
  const [pending, start] = useTransition()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 8000)
    return () => clearInterval(t)
  }, [router])
  return (
    <button onClick={() => start(() => router.refresh())} aria-label="Check for new chats" className="ml-auto rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
      <RefreshCw size={14} className={pending ? 'animate-spin' : ''} />
    </button>
  )
}

type Msg = { id: string; role: string; text: string; at: string; lookups: string[] }
type Conv = {
  id: string
  status: string
  unread: number
  name: string | null
  email: string | null
  phone: string | null
  userId: string | null
  pageUrl: string | null
  reason: string | null
  test: boolean
  operatorId: string | null
  came: { at: string; label: string }[]
}

export function ChatThread({ conversation: c, messages, operators }: { conversation: Conv; messages: Msg[]; operators: { id: string; name: string }[] }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [err, setErr] = useState<string>()
  const [sending, startSend] = useTransition()
  const [switching, startSwitch] = useTransition()
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Best effort: a dropped request must not break the page.
    if (c.unread > 0) markChatRead(c.id).catch(() => {})
  }, [c.id, c.unread])
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [messages.length])

  const status = (s: 'BOT' | 'HUMAN' | 'CLOSED') => startSwitch(async () => (await changeStatus(c.id, s), router.refresh()))
  const send = () =>
    startSend(async () => {
      setErr(undefined)
      const r = await sendTeamReply(c.id, text)
      if (r.error) return setErr(r.error)
      setText('')
      router.refresh()
    })

  return (
    <>
      <header className="space-y-2 border-b border-zinc-200 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto font-semibold">
            {c.name || 'Visitor'}
            {c.test && <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-normal text-zinc-500">test</span>}
          </p>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.status === 'HUMAN' ? 'bg-amber-50 text-amber-800' : c.status === 'BOT' ? 'bg-indigo-50 text-indigo-700' : 'bg-zinc-100 text-zinc-600'}`}>
            {c.status === 'HUMAN' ? 'Your team answers' : c.status === 'BOT' ? 'Assistant answers' : 'Closed'}
          </span>
          {operators.length > 0 && (
            <select
              aria-label="Operator"
              value={c.operatorId ?? ''}
              disabled={switching}
              onChange={(e) => startSwitch(async () => (await reassignChat(c.id, e.target.value || null), router.refresh()))}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs"
            >
              <option value="">No operator</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          {c.status !== 'BOT' && (
            <button disabled={switching} onClick={() => status('BOT')} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50">
              <Bot size={13} /> Back to the assistant
            </button>
          )}
          {c.status !== 'CLOSED' && (
            <button disabled={switching} onClick={() => status('CLOSED')} className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50">
              Close
            </button>
          )}
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
          {c.phone && (
            <div>
              <dt className="inline">Phone </dt>
              <dd className="inline text-zinc-900">
                <a href={`tel:${c.phone}`}>{c.phone}</a>
              </dd>
            </div>
          )}
          {c.email && (
            <div>
              <dt className="inline">E-mail </dt>
              <dd className="inline text-zinc-900">
                <a href={`mailto:${c.email}`}>{c.email}</a>
              </dd>
            </div>
          )}
          {c.userId && (
            <div className="inline-flex items-center gap-1">
              <ShieldCheck size={12} className="text-emerald-600" />
              <dt className="inline">Signed-in customer </dt>
              <dd className="inline text-zinc-900">{c.userId}</dd>
            </div>
          )}
          {c.came[0] && (
            <div>
              <dt className="inline">Came from </dt>
              <dd className="inline text-zinc-900">{c.came[0].label}</dd>
            </div>
          )}
          {c.pageUrl && (
            <div className="max-w-full truncate">
              <dt className="inline">On </dt>
              <dd className="inline text-zinc-900">{c.pageUrl}</dd>
            </div>
          )}
        </dl>
        {c.reason && c.status === 'HUMAN' && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Handed over: {c.reason}</p>}
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto bg-zinc-50 p-4" role="log" aria-label="Messages">
        {messages.map((m) =>
          m.role === 'NOTE' ? (
            <p key={m.id} className="text-center text-xs text-zinc-500">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className={`flex flex-col ${m.role === 'VISITOR' ? 'items-start' : 'items-end'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'VISITOR' ? 'bg-white ring-1 ring-zinc-200' : m.role === 'BOT' ? 'bg-indigo-50 text-indigo-950' : 'bg-zinc-900 text-white'
                }`}
              >
                {m.text}
              </div>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-400">
                {m.role === 'BOT' ? 'Assistant · ' : m.role === 'AGENT' ? 'Team · ' : ''}
                <LocalTime iso={m.at} options={TIME} />
                {m.lookups.length > 0 && (
                  <span className="inline-flex items-center gap-0.5" title="Data lookups behind this answer">
                    · <Database size={11} /> {m.lookups.join(', ')}
                  </span>
                )}
              </span>
            </div>
          ),
        )}
        <div ref={end} />
      </div>

      <div className="border-t border-zinc-200 p-3">
        {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
                e.preventDefault()
                send()
              }
            }}
            rows={2}
            placeholder={c.status === 'BOT' ? 'Write to take over from the assistant…' : 'Write your answer…'}
            aria-label="Your answer"
            className="flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
          <button onClick={send} disabled={sending || !text.trim()} className="inline-flex items-center gap-1.5 self-end rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send
          </button>
        </div>
      </div>
    </>
  )
}
