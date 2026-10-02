'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Lock } from 'lucide-react'
import { resetPassword } from '../actions'

const input =
  'w-full rounded-lg border border-zinc-200 py-2.5 pr-3 pl-9 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100'

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined)
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <h1 className="text-xl font-semibold">Set a new password</h1>
      <p className="mt-1 text-sm text-zinc-500">You&apos;ll be signed in right after. Other devices will be signed out.</p>
      {state?.error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}{' '}
          {state.error.includes('expired') && (
            <Link href="/forgot-password" className="font-medium underline">
              Get a new link
            </Link>
          )}
        </p>
      )}
      <div className="mt-5 space-y-3">
        <div className="relative">
          <Lock size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
          <input name="password" type="password" aria-label="New password" required minLength={8} autoComplete="new-password" placeholder="New password (8+ characters)" className={input} />
        </div>
        <div className="relative">
          <Lock size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
          <input name="confirm" type="password" aria-label="Repeat new password" required minLength={8} autoComplete="new-password" placeholder="Repeat new password" className={input} />
        </div>
      </div>
      <button
        disabled={pending}
        className="mt-4 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save and sign in'}
      </button>
    </form>
  )
}
