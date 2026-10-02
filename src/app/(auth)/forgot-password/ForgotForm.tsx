'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { KeyRound, Mail, MailCheck } from 'lucide-react'
import { requestPasswordReset } from '../actions'

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined)

  if (state?.sent) {
    return (
      <div className="py-2 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
          <MailCheck size={22} />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Check your inbox</h1>
        <p className="mt-1 text-sm text-zinc-500">
          If <span className="font-medium text-zinc-800">{state.sent}</span> has a Khma account, we sent a link to set a
          new password. It expires in 30 minutes.
        </p>
        <Link href="/login" className="mt-5 inline-block text-sm font-medium hover:underline">
          Back to log in
        </Link>
      </div>
    )
  }

  return (
    <form action={action}>
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-zinc-100 text-zinc-700">
        <KeyRound size={20} />
      </span>
      <h1 className="mt-4 text-xl font-semibold">Forgot your password?</h1>
      <p className="mt-1 text-sm text-zinc-500">Enter your email and we&apos;ll send you a link to set a new one.</p>
      {state?.error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <div className="relative mt-5">
        <Mail size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="name@company.com"
          defaultValue={state?.fields?.email}
          className="w-full rounded-lg border border-zinc-200 py-2.5 pr-3 pl-9 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
        />
      </div>
      <button
        disabled={pending}
        className="mt-3 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
      <p className="mt-5 text-center text-sm">
        <Link href="/login" className="text-zinc-500 hover:text-zinc-900 hover:underline">
          Back to log in
        </Link>
      </p>
    </form>
  )
}
