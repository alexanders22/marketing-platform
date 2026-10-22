'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { handleClientError } from '@/lib/client-errors'

// A page of the app failed: the sidebar stays, the error is reported (and a
// tab on the previous build reloads once), and the page can be tried again.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => handleClientError(error, 'app'), [error])
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-2xl bg-white p-6 text-center ring-1 ring-zinc-200">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
        <AlertTriangle size={19} />
      </span>
      <h2 className="mt-3 text-base font-semibold">This page couldn&apos;t load</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Try again — if it keeps happening, write to info@loudpilot.app{error.digest ? ` and mention ${error.digest}` : ''}.
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
