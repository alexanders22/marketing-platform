'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Check, Eye, Loader2, RefreshCw, RotateCcw, ScanSearch } from 'lucide-react'
import { confirmDialog } from '@/components/ui/Dialog'
import { checkInstall, revealSecret, rotateSecret, saveTagSettings, type TagSettings } from './actions'

const input = 'w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400'

export function CheckInstall() {
  const [pending, start] = useTransition()
  const [res, setRes] = useState<{ ok?: boolean; message: string }>()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => start(async () => setRes(await checkInstall()))}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <ScanSearch size={15} />} Check my website
      </button>
      {res && (
        <p role="status" className={`text-sm ${res.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
          {res.message}
        </p>
      )}
    </div>
  )
}

// New events show up without reloading.
export function LiveRefresh({ every = 10_000 }: { every?: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every)
    return () => clearInterval(t)
  }, [router, every])
  return (
    <button onClick={() => start(() => router.refresh())} aria-label="Refresh events" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
      <RefreshCw size={15} className={pending ? 'animate-spin' : ''} />
    </button>
  )
}

export function SecretBox({ canManage }: { canManage: boolean }) {
  const [secret, setSecret] = useState<string>()
  const [err, setErr] = useState<string>()
  const [pending, start] = useTransition()
  if (!canManage) return <p className="text-sm text-zinc-500">Only the owner or an admin can see the secret.</p>
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-100 px-3 py-2 font-mono text-[13px]" aria-label="Site secret">
          {secret ?? 'lpsec_••••••••••••••••••••••••'}
        </code>
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await revealSecret()
              setErr(r.error)
              if (r.secret) setSecret(r.secret)
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          <Eye size={15} /> Show
        </button>
        <button
          disabled={pending}
          onClick={async () => {
            const ok = await confirmDialog('Make a new secret?', {
              body: 'The current secret stops working at once: identity hashes, server events and your data endpoint must switch to the new one.',
              confirm: 'Make a new secret',
              danger: true,
            })
            if (!ok) return
            start(async () => {
              const r = await rotateSecret()
              setErr(r.error)
              if (r.secret) setSecret(r.secret)
            })
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          <RotateCcw size={15} /> New secret
        </button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  )
}

const FORWARD = ['Lead', 'Purchase', 'CompleteRegistration', 'Contact', 'Schedule', 'SubmitApplication', 'Subscribe', 'StartTrial', 'AddToCart', 'InitiateCheckout']

export function TagSettingsForm({
  initial,
  hasToken,
  pixels,
  canManage,
}: {
  initial: Omit<TagSettings, 'capiToken'>
  hasToken: boolean
  pixels: string[]
  canManage: boolean
}) {
  const router = useRouter()
  const [s, setS] = useState<TagSettings>({ ...initial, capiToken: '' })
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const set = <K extends keyof TagSettings>(k: K, v: TagSettings[K]) => setS((x) => ({ ...x, [k]: v }))
  const toggle = (k: 'consentRequired' | 'autoForms' | 'capi' | 'pixelMirror', label: string, hint: string) => (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" className="mt-1" checked={s[k]} disabled={!canManage} onChange={(e) => set(k, e.target.checked)} />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-zinc-500">{hint}</span>
      </span>
    </label>
  )
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const r = await saveTagSettings(s)
          setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: 'Saved.' })
          if (!r.error) {
            setS((x) => ({ ...x, capiToken: '' }))
            router.refresh()
          }
        })
      }}
    >
      <div>
        <label htmlFor="tag-domains" className="text-sm font-medium">
          Your domains
        </label>
        <p className="mb-1.5 text-xs text-zinc-500">Events are accepted only from these sites and their subdomains. Leave empty to accept any site (not recommended).</p>
        <input id="tag-domains" className={input} disabled={!canManage} placeholder="shop.ge, shop.com" value={s.domains} onChange={(e) => set('domains', e.target.value)} />
      </div>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">Privacy and automatic events</legend>
        {toggle('consentRequired', 'Wait for cookie consent', "Nothing is stored or sent until your cookie banner calls loudpilot('consent', true). Needed for visitors from the EU.")}
        {toggle('autoForms', 'Forms with an e-mail or phone are leads', 'Contact and order forms count as a Lead automatically (login forms never do).')}
      </fieldset>
      <fieldset className="space-y-3 rounded-xl border border-zinc-200 p-4">
        <legend className="px-1 text-sm font-semibold">Send conversions to Meta (Conversions API)</legend>
        {toggle('capi', 'Send conversions to my Meta pixel', 'From our server, so ad blockers and iPhones don’t hide them. Ads learn who becomes a customer and get cheaper.')}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tag-pixel" className="text-sm font-medium">
              Pixel (dataset) id
            </label>
            <input id="tag-pixel" className={input} disabled={!canManage} list="tag-pixels" inputMode="numeric" placeholder="123456789012345" value={s.pixelId} onChange={(e) => set('pixelId', e.target.value)} />
            <datalist id="tag-pixels">
              {pixels.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="tag-token" className="text-sm font-medium">
              Conversions API token <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <input
              id="tag-token"
              type="password"
              autoComplete="off"
              className={input}
              disabled={!canManage}
              placeholder={hasToken ? 'Saved — type to replace, "-" to remove' : 'Uses your connected ad account'}
              value={s.capiToken}
              onChange={(e) => set('capiToken', e.target.value)}
            />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">Events to send</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {FORWARD.map((e) => (
              <label key={e} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${s.capiEvents.includes(e) ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-zinc-200'}`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  disabled={!canManage}
                  checked={s.capiEvents.includes(e)}
                  onChange={(x) => set('capiEvents', x.target.checked ? [...s.capiEvents, e] : s.capiEvents.filter((y) => y !== e))}
                />
                {s.capiEvents.includes(e) && <Check size={12} />}
                {e}
              </label>
            ))}
          </div>
        </div>
        {toggle(
          'pixelMirror',
          'Also send them through the pixel on my site',
          'Turn on if your site does not send these events to the pixel itself. Meta then counts each one once (same event id). If your site already does, leave it off and skip those events above to avoid double counting.',
        )}
      </fieldset>
      {canManage && (
        <div className="flex items-center gap-3">
          <button disabled={pending} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">
            {pending ? 'Saving…' : 'Save settings'}
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
