'use client'

import { useState, useTransition } from 'react'
import type { AuthorizeParams } from '@/lib/oauth'
import { decide } from './actions'

export function ConsentForm({ params, workspaces }: { params: AuthorizeParams; workspaces: { id: string; name: string }[] }) {
  const [ws, setWs] = useState(workspaces[0]?.id ?? '')
  const [pending, start] = useTransition()
  return (
    <div className="mt-6 space-y-4">
      {workspaces.length > 1 && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Company</span>
          <select value={ws} onChange={(e) => setWs(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" aria-label="Company">
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-3">
        <button
          disabled={pending}
          onClick={() => start(() => decide(params, ws, false))}
          className="flex-1 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
        >
          Deny
        </button>
        <button
          disabled={pending || !ws}
          onClick={() => start(() => decide(params, ws, true))}
          className="flex-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? 'Connecting…' : 'Allow'}
        </button>
      </div>
    </div>
  )
}
