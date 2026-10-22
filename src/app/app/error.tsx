'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react'
import { handleClientError, isTransient, nextRetryDelay, RECOVERED_EVENT, whenOnline } from '@/lib/client-errors'

// A page of the app failed. The sidebar stays and the error is reported. A
// connection blip (offline, the server restarting for a deploy) is retried by
// itself once the browser is online; a tab on the previous build reloads.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [delay] = useState(() => (isTransient(error) ? nextRetryDelay() : null))
  useEffect(() => handleClientError(error, 'app'), [error])
  useEffect(
    () =>
      delay === null
        ? undefined
        : whenOnline(delay, () => {
            window.dispatchEvent(new Event(RECOVERED_EVENT))
            retry()
          }),
    [delay, retry],
  )

  if (delay !== null)
    return (
      <div role="status" className="mx-auto mt-16 flex max-w-md items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 size={15} className="animate-spin" /> Connection lost — reconnecting…
      </div>
    )
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-2xl bg-white p-6 text-center ring-1 ring-zinc-200">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
        <AlertTriangle size={19} />
      </span>
      <h2 className="mt-3 text-base font-semibold">This page couldn&apos;t load</h2>
      <p className="mt-1 text-sm text-zinc-600">
        {isTransient(error) ? 'The server can’t be reached right now. ' : ''}Try again — if it keeps happening, write to info@loudpilot.app
        {error.digest ? ` and mention ${error.digest}` : ''}.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={() => retry()} className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
          <RotateCw size={14} /> Try again
        </button>
        <button onClick={() => location.reload()} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
          Reload page
        </button>
      </div>
    </div>
  )
}
