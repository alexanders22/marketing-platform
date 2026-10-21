'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Plus, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { CHAT_LANGUAGES } from '@/lib/chat-languages'
import type { BotAction } from '@/lib/chatbot'
import { connectTelegram, disconnectTelegram, saveBot, telegramLinks, testLookup, writeFromWebsite, type BotSettings } from '../actions'

const input = 'w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 disabled:bg-zinc-50'
const card = 'rounded-2xl border border-zinc-200 bg-white p-5'
const button = 'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60'

// Ready-made lookups people usually need; the owner edits them freely.
const TEMPLATES: BotAction[] = [
  { key: 'order_status', description: 'Status and delivery of an order. Ask for the order number and the e-mail or phone used for it.', params: ['order_number', 'email_or_phone'], verified: false },
  { key: 'my_orders', description: 'The signed-in customer’s recent orders and their status.', params: [], verified: true },
  { key: 'booking', description: 'A booking or appointment: date, time and status. Ask for the booking number and the phone used for it.', params: ['booking_number', 'phone'], verified: false },
]

export function BotForm({ initial, canManage, website, telegram }: { initial: BotSettings; canManage: boolean; website: string | null; telegram: string | null }) {
  const router = useRouter()
  const [s, setS] = useState<BotSettings>(initial)
  const [saving, startSave] = useTransition()
  const [writing, startWrite] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [writeErr, setWriteErr] = useState<string>()
  const [lang, setLang] = useState('English')
  const set = <K extends keyof BotSettings>(k: K, v: BotSettings[K]) => setS((x) => ({ ...x, [k]: v }))
  const setAction = (i: number, a: Partial<BotAction>) => set('actions', s.actions.map((x, k) => (k === i ? { ...x, ...a } : x)))
  const off = !canManage

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        startSave(async () => {
          const r = await saveBot(s)
          setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: 'Saved.' })
          if (!r.error) router.refresh()
        })
      }}
    >
      <section className={card}>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={s.enabled} disabled={off} onChange={(e) => set('enabled', e.target.checked)} />
          <span>
            <span className="font-semibold">Show the chat on my website</span>
            <span className="block text-sm text-zinc-500">Each conversation the assistant answers uses 1 credit. Off: the chat still works in the demo shop, for testing.</span>
          </span>
        </label>
      </section>

      <section className={`${card} space-y-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">What it knows</h2>
          <select aria-label="Language of the brief" value={lang} onChange={(e) => setLang(e.target.value)} disabled={off} className="rounded-lg border border-zinc-200 px-2 py-2 text-sm">
            {['English', 'Georgian', 'Russian'].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={off || writing}
            className={button}
            onClick={() =>
              startWrite(async () => {
                setWriteErr(undefined)
                const r = await writeFromWebsite(lang)
                if (r.error) return setWriteErr(r.error)
                if (r.setup) setS((x) => ({ ...x, ...r.setup, redFlags: r.setup!.redFlags || x.redFlags }))
              })
            }
          >
            {writing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {writing ? 'Reading your website…' : 'Write it from my website'}
          </button>
        </div>
        {writeErr && <p className="text-sm text-red-600">{writeErr}</p>}
        {!website && <p className="text-sm text-amber-700">Add your website in Brand → Brand kit so the assistant can learn from it.</p>}
        <p className="text-xs text-zinc-500">It writes a short start (2 credits): check it, fill in anything marked [fill in] and add the rest yourself — the assistant answers only from this.</p>
        <div>
          <label htmlFor="bot-instructions" className="text-sm font-medium">
            Main instructions
          </label>
          <p className="mb-1.5 text-xs text-zinc-500">Who the assistant is, what you sell, who your customers are, the tone, what it should help with.</p>
          <textarea id="bot-instructions" rows={7} disabled={off} className={input} value={s.instructions} onChange={(e) => set('instructions', e.target.value)} />
        </div>
        <div>
          <label htmlFor="bot-knowledge" className="text-sm font-medium">
            Facts and answers
          </label>
          <p className="mb-1.5 text-xs text-zinc-500">Prices, hours, addresses, delivery and returns, payment — one per line. These win over anything else.</p>
          <textarea id="bot-knowledge" rows={9} disabled={off} className={`${input} font-mono text-[13px]`} value={s.knowledge} onChange={(e) => set('knowledge', e.target.value)} />
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Languages it answers in</legend>
          <p className="mb-1.5 text-xs text-zinc-500">None picked: the visitor’s own language. Picked: those only (a visitor writing in another gets the first one).</p>
          <div className="flex flex-wrap gap-2">
            {CHAT_LANGUAGES.map((l) => {
              const on = s.languages.includes(l)
              return (
                <label key={l} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${on ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-zinc-200'}`}>
                  <input type="checkbox" className="sr-only" disabled={off} checked={on} onChange={() => set('languages', on ? s.languages.filter((x) => x !== l) : [...s.languages, l])} />
                  {l}
                </label>
              )
            })}
          </div>
        </fieldset>
      </section>

      <section className={`${card} space-y-4`}>
        <h2 className="font-semibold">When a person must answer</h2>
        <div>
          <label htmlFor="bot-flags" className="text-sm font-medium">
            Red-flag topics
          </label>
          <p className="mb-1.5 text-xs text-zinc-500">One per line. On these the assistant stops, says a teammate will answer, asks for a contact and alerts your team.</p>
          <textarea id="bot-flags" rows={4} disabled={off} className={input} placeholder={'refund\ncomplaint\nlegal'} value={s.redFlags} onChange={(e) => set('redFlags', e.target.value)} />
        </div>
        <div>
          <label htmlFor="bot-emails" className="text-sm font-medium">
            E-mail alerts to
          </label>
          <input id="bot-emails" disabled={off} className={input} placeholder="Owners and admins of the account" value={s.notifyEmails} onChange={(e) => set('notifyEmails', e.target.value)} />
        </div>
        <TelegramConnect name={telegram} canManage={canManage} />
      </section>

      <section className={`${card} space-y-4`}>
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheck size={17} /> Orders and accounts — your data, safely
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            The assistant never gets your database. You add one endpoint on your server; the assistant can only ask it the lookups below, every request is signed
            with your site secret, and your server decides what to answer. Lookups “for signed-in customers” get the customer id from your website’s login — the
            assistant can’t ask about anyone else.{' '}
            <Link href="/docs/website#data-endpoint" className="text-indigo-600">
              Developer guide
            </Link>
          </p>
        </div>
        <div>
          <label htmlFor="bot-endpoint" className="text-sm font-medium">
            Your data endpoint
          </label>
          <input id="bot-endpoint" disabled={off} className={input} placeholder="https://api.yourshop.ge/loudpilot" value={s.actionsUrl} onChange={(e) => set('actionsUrl', e.target.value)} />
        </div>
        <ul className="space-y-3" aria-label="Lookups">
          {s.actions.map((a, i) => (
            <li key={i} className="space-y-2 rounded-xl border border-zinc-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input aria-label="Lookup name" disabled={off} className={`${input} max-w-[220px] font-mono`} value={a.key} onChange={(e) => setAction(i, { key: e.target.value })} />
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" disabled={off} checked={a.verified} onChange={(e) => setAction(i, { verified: e.target.checked })} />
                  For signed-in customers only
                </label>
                <button type="button" disabled={off} aria-label={`Remove ${a.key}`} onClick={() => set('actions', s.actions.filter((_, k) => k !== i))} className="ml-auto rounded-lg p-2 text-zinc-500 hover:bg-zinc-100">
                  <Trash2 size={15} />
                </button>
              </div>
              <input aria-label="When to use it" disabled={off} className={input} placeholder="When the assistant should use it" value={a.description} onChange={(e) => setAction(i, { description: e.target.value })} />
              <input
                aria-label="Details it asks for"
                disabled={off}
                className={input}
                placeholder="Details it asks the visitor for, comma separated (e.g. order_number, email_or_phone)"
                value={a.params.join(', ')}
                onChange={(e) => setAction(i, { params: e.target.value.split(',').map((p) => p.trim()) })}
              />
              <LookupTest url={s.actionsUrl} action={a} />
            </li>
          ))}
        </ul>
        {!off && (
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.filter((t) => !s.actions.some((a) => a.key === t.key)).map((t) => (
              <button key={t.key} type="button" className={button} onClick={() => set('actions', [...s.actions, t])}>
                <Plus size={15} /> {t.key.replace('_', ' ')}
              </button>
            ))}
            <button type="button" className={button} onClick={() => set('actions', [...s.actions, { key: 'lookup', description: '', params: [], verified: false }])}>
              <Plus size={15} /> Custom lookup
            </button>
          </div>
        )}
      </section>

      <section className={`${card} grid gap-4 sm:grid-cols-2`}>
        <h2 className="font-semibold sm:col-span-2">Look</h2>
        <div>
          <label htmlFor="bot-name" className="text-sm font-medium">
            Name
          </label>
          <input id="bot-name" disabled={off} className={input} value={s.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label htmlFor="bot-greeting" className="text-sm font-medium">
            First message
          </label>
          <input id="bot-greeting" disabled={off} className={input} value={s.greeting} onChange={(e) => set('greeting', e.target.value)} />
        </div>
        <div className="flex items-end gap-4">
          <label className="text-sm font-medium">
            Colour
            <input type="color" disabled={off} value={s.color} onChange={(e) => set('color', e.target.value)} className="ml-2 h-9 w-12 rounded align-middle" />
          </label>
          <label className="text-sm font-medium">
            Side
            <select disabled={off} value={s.position} onChange={(e) => set('position', e.target.value as 'left' | 'right')} className="ml-2 rounded-lg border border-zinc-200 px-2 py-2 text-sm">
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </label>
        </div>
      </section>

      {canManage && (
        <div className="sticky bottom-0 flex items-center gap-3 border-t border-zinc-200 bg-white/95 py-3 backdrop-blur">
          <button disabled={saving} className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
          {msg && (
            <span role="status" className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              {msg.text}
            </span>
          )}
        </div>
      )}
    </form>
  )
}

function LookupTest({ url, action }: { url: string; action: BotAction }) {
  const [open, setOpen] = useState(false)
  const [params, setParams] = useState<Record<string, string>>({})
  const [customer, setCustomer] = useState('')
  const [pending, start] = useTransition()
  const [out, setOut] = useState<string>()
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-indigo-600">
        Send a test request
      </button>
    )
  const names = action.params.map((p) => p.trim()).filter(Boolean)
  return (
    <div className="space-y-2 rounded-lg bg-zinc-50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {names.map((p) => (
          <input key={p} aria-label={p} placeholder={p} className={input} value={params[p] ?? ''} onChange={(e) => setParams((x) => ({ ...x, [p]: e.target.value }))} />
        ))}
        {action.verified && <input aria-label="Customer id" placeholder="Signed-in customer id" className={input} value={customer} onChange={(e) => setCustomer(e.target.value)} />}
      </div>
      <button
        type="button"
        disabled={pending}
        className={button}
        onClick={() =>
          start(async () => {
            const r = await testLookup(url, action, params, customer)
            setOut(r.error ?? `${r.ms} ms\n${JSON.stringify(r.response, null, 2)}`)
          })
        }
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send
      </button>
      {out && (
        <pre role="status" className="max-h-64 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">
          {out}
        </pre>
      )}
    </div>
  )
}

function TelegramConnect({ name, canManage }: { name: string | null; canManage: boolean }) {
  const router = useRouter()
  const [links, setLinks] = useState<{ person?: string; group?: string }>()
  const [err, setErr] = useState<string>()
  const [pending, start] = useTransition()
  if (name)
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        Telegram alerts go to <b>{name}</b>.
        {canManage && (
          <button type="button" className="text-xs text-zinc-500 underline" onClick={() => start(async () => (await disconnectTelegram(), router.refresh()))}>
            Disconnect
          </button>
        )}
      </p>
    )
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">Telegram alerts</p>
      {!links ? (
        <button type="button" disabled={!canManage || pending} className={button} onClick={() => start(async () => {
          const r = await telegramLinks()
          if (r.error) setErr(r.error)
          else setLinks(r)
        })}>
          Connect Telegram
        </button>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-zinc-600">
          <li>
            Open{' '}
            <a href={links.person} target="_blank" rel="noreferrer" className="text-indigo-600">
              the Loudpilot bot
            </a>{' '}
            and press Start — or{' '}
            <a href={links.group} target="_blank" rel="noreferrer" className="text-indigo-600">
              add it to your team’s group
            </a>
            .
          </li>
          <li>
            <button type="button" disabled={pending} className={button} onClick={() => start(async () => {
              const r = await connectTelegram()
              if (r.error) setErr(r.error)
              else router.refresh()
            })}>
              {pending && <Loader2 size={15} className="animate-spin" />} I pressed Start — check
            </button>
          </li>
        </ol>
      )}
      {err && <p className="text-red-600">{err}</p>}
    </div>
  )
}
