'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { SiGoogleanalytics } from 'react-icons/si'
import { LocalTime } from '@/components/LocalTime'
import { DisconnectButton } from './DisconnectButton'
import { pickGaProperty, syncGaNow } from './ga-actions'

type GaAccount = {
  id: string
  name: string
  account: string | null
  pending: boolean
  properties: { id: string; name: string; account: string }[]
  status: string
  lastError: string | null
  syncedAt: string | null
}

// Website numbers from Google Analytics 4: visits, users and key events
// (sign-ups, leads, purchases) next to the ad spend.
export function GoogleAnalyticsSection({ accounts, enabled, canEdit, pick }: { accounts: GaAccount[]; enabled: boolean; canEdit: boolean; pick: boolean }) {
  const pending = accounts.find((a) => a.pending)
  const connected = accounts.filter((a) => !a.pending)
  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-white ring-1 ring-zinc-200">
          <SiGoogleanalytics size={20} color="#E37400" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Google Analytics</h2>
          <p className="text-sm text-zinc-500">Website visits, sign-ups, leads and sales — so ads are judged by real results, like the cost per sign-up.</p>
        </div>
        {enabled && canEdit ? (
          // A route handler that redirects to Google: a full page load, not a client navigation.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/auth/google-analytics" className="shrink-0 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50">
            {connected.length ? 'Add or refresh' : 'Connect'}
          </a>
        ) : (
          <span className="shrink-0 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-500">{enabled ? 'Owners and admins connect' : 'Soon'}</span>
        )}
      </div>

      {pending && canEdit && <PropertyPicker pending={pending} highlight={pick} />}

      {connected.length > 0 && (
        <ul className="mt-5 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {connected.map((a) => (
            <li key={a.id} className="flex min-w-0 flex-wrap items-center gap-3 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-50 ring-1 ring-zinc-200">
                <SiGoogleanalytics size={15} color="#E37400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {a.name} {a.account && <span className="text-zinc-400">· {a.account}</span>}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {a.status !== 'ACTIVE' ? (
                    <span className="font-medium text-red-600">Needs reconnecting{a.lastError ? ` — ${a.lastError}` : ''}</span>
                  ) : a.syncedAt ? (
                    <>
                      Updated <LocalTime iso={a.syncedAt} options={{ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }} />
                      {a.lastError && <span className="ml-2 text-amber-700">{a.lastError}</span>}
                    </>
                  ) : (
                    'Reading the last 12 months…'
                  )}
                </p>
              </div>
              <SyncButton id={a.id} />
              {canEdit && <DisconnectButton id={a.id} name={a.name} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PropertyPicker({ pending, highlight }: { pending: GaAccount; highlight: boolean }) {
  const router = useRouter()
  const [choice, setChoice] = useState(pending.properties[0]?.id ?? '')
  const [error, setError] = useState<string>()
  const [busy, start] = useTransition()
  return (
    <div className={`mt-5 rounded-xl p-4 ring-1 ${highlight ? 'bg-amber-50 ring-amber-200' : 'bg-zinc-50 ring-zinc-200'}`}>
      <p className="text-sm font-semibold">Which website should Loudpilot read?</p>
      <div role="radiogroup" aria-label="Google Analytics property" className="mt-2 max-h-64 space-y-1 overflow-y-auto">
        {pending.properties.map((p) => (
          <label key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white">
            <input type="radio" name="ga-property" checked={choice === p.id} onChange={() => setChoice(p.id)} />
            <span className="font-medium">{p.name}</span>
            {p.account && <span className="text-zinc-500">· {p.account}</span>}
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        disabled={busy || !choice}
        onClick={() =>
          start(async () => {
            setError(undefined)
            const res = await pickGaProperty(pending.id, choice)
            if (res.error) return setError(res.error)
            router.replace('/app/channels?connected=1')
          })
        }
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {busy && <Loader2 size={14} className="animate-spin" />} Use this property
      </button>
    </div>
  )
}

function SyncButton({ id }: { id: string }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<string>()
  return (
    <span className="flex items-center gap-2">
      {msg && <span className="text-xs text-red-600">{msg}</span>}
      <button
        disabled={busy}
        aria-label="Update website numbers now"
        title="Update now"
        onClick={() =>
          start(async () => {
            const res = await syncGaNow(id)
            setMsg(res.error)
            router.refresh()
          })
        }
        className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
      </button>
    </span>
  )
}
