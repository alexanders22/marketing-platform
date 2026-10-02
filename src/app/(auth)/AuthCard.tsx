'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Lock, Mail, MailCheck } from 'lucide-react'
import { passwordLogin, passwordSignup, requestMagicLink } from './actions'

type Props = {
  mode: 'login' | 'signup'
  googleEnabled: boolean
  mailEnabled: boolean
  error?: string
}

const ERRORS: Record<string, string> = {
  link: 'That sign-in link is invalid or has expired. Request a new one.',
  google: 'Google sign-in failed. Please try again.',
}

export function AuthCard({ mode, googleEnabled, mailEnabled, error }: Props) {
  // Without outgoing mail, password is the only way to sign up.
  const [tab, setTab] = useState<'magic' | 'password'>(mailEnabled ? 'magic' : 'password')
  const [magic, magicAction, magicPending] = useActionState(requestMagicLink, undefined)
  const [pw, pwAction, pwPending] = useActionState(mode === 'login' ? passwordLogin : passwordSignup, undefined)

  if (magic?.sent) {
    return (
      <div className="py-2 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
          <MailCheck size={22} />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Check your inbox</h1>
        <p className="mt-1 text-sm text-zinc-500">
          We sent a sign-in link to <span className="font-medium text-zinc-800">{magic.sent}</span>. It expires in 15
          minutes.
        </p>
        <a href={mode === 'login' ? '/login' : '/signup'} className="mt-5 inline-block text-sm font-medium hover:underline">
          Use a different email
        </a>
      </div>
    )
  }

  const showTabs = mode === 'login' && mailEnabled
  const state = tab === 'magic' ? magic : pw
  const message = state?.error ?? (error ? ERRORS[error] : undefined)

  return (
    <div>
      <h1 className="text-xl font-semibold">{mode === 'login' ? 'Log in to continue' : 'Sign up to continue'}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <Link href={mode === 'login' ? '/signup' : '/login'} className="font-semibold text-zinc-900 hover:underline">
          {mode === 'login' ? 'Sign up' : 'Log in'}
        </Link>
      </p>

      {showTabs && (
        <div className="mt-6 grid grid-cols-2 rounded-lg bg-zinc-100 p-1 text-sm">
          {(['magic', 'password'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md py-2 font-medium transition ${
                tab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {t === 'magic' ? 'Magic link' : 'Password'}
            </button>
          ))}
        </div>
      )}

      {message && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      )}

      {tab === 'magic' ? (
        <form action={magicAction} className="mt-5 space-y-3">
          <EmailInput defaultValue={magic?.fields?.email} />
          <Submit pending={magicPending}>Send magic link</Submit>
        </form>
      ) : (
        <form action={pwAction} className="mt-5 space-y-3">
          <EmailInput defaultValue={pw?.fields?.email} />
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
            <input
              name="password"
              type="password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'signup' ? 'Create a password (8+ characters)' : 'Password'}
              className="w-full rounded-lg border border-zinc-200 py-2.5 pr-3 pl-9 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
            />
          </div>
          <Submit pending={pwPending}>{mode === 'login' ? 'Log in' : 'Create account'}</Submit>
        </form>
      )}

      {googleEnabled && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200" />
            OR
            <span className="h-px flex-1 bg-zinc-200" />
          </div>
          <a
            href="/auth/google"
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-200 py-2.5 text-sm font-semibold transition hover:bg-zinc-50"
          >
            <GoogleIcon />
            Continue with Google
          </a>
        </>
      )}

      <p className="mt-5 text-xs leading-relaxed text-zinc-500">
        By continuing, you agree to the <span className="underline">Terms of Service</span>,{' '}
        <span className="underline">Privacy Policy</span>, and <span className="underline">Cookie Policy</span>.
      </p>
    </div>
  )
}

function EmailInput({ defaultValue }: { defaultValue?: string }) {
  return (
    <div className="relative">
      <Mail size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="name@company.com"
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-zinc-200 py-2.5 pr-3 pl-9 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
      />
    </div>
  )
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
    >
      {pending ? 'Please wait…' : children}
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z" />
    </svg>
  )
}
