'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowRight, Check, Coins, Loader2, Sparkles, Target, Wand2 } from 'lucide-react'
import { profileReady, startInterview } from './actions'

const LANGUAGES = ['English', 'Georgian', 'Russian'] as const

const FEATURES = [
  { icon: Wand2, title: 'Skips what we know', text: 'Your website and ads already answer part of it.' },
  { icon: Coins, title: 'Shows the money', text: 'Every answer turns into what a customer may cost.' },
  { icon: Target, title: 'Ends with a plan', text: 'Goals, audiences, budget, ads and posts.' },
]

export function InterviewStart({ company, resumeId, returning, welcome }: { company: string; resumeId: string | null; returning: boolean; welcome: boolean }) {
  const router = useRouter()
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]>('English')
  const [phase, setPhase] = useState<'idle' | 'site' | 'compose'>('idle')
  const [error, setError] = useState<string>()
  const [, start] = useTransition()
  // One interview per click (effects run twice in development).
  const composing = useRef(false)

  // Right after sign-up the website is still being read: wait for it.
  useEffect(() => {
    if (phase !== 'site') return
    let stop = false
    const until = Date.now() + 90_000
    const check = async () => {
      if (stop) return
      if ((await profileReady()) || Date.now() > until) return !stop && setPhase('compose')
      setTimeout(check, 3000)
    }
    void check()
    return () => {
      stop = true
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'compose' || composing.current) return
    composing.current = true
    start(async () => {
      const res = await startInterview(language)
      if (res.error || !res.id) {
        setError(res.error ?? 'Could not start the interview')
        composing.current = false
        setPhase('idle')
        return
      }
      router.push(`/app/strategy/interview/${res.id}`)
    })
  }, [phase, language, router])

  const steps = [
    { label: 'Reading your website', done: phase === 'compose' },
    { label: 'Checking your ads and posts', done: false },
    { label: `Picking the questions that matter for ${company}`, done: false },
  ]

  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative overflow-hidden rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200/70 sm:p-10">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-[#7b3ff2]/20 via-[#ff2e6e]/15 to-[#ff5b14]/10 blur-3xl" />
        <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#7b3ff2] via-[#ff2e6e] to-[#ff5b14] text-white shadow-lg shadow-fuchsia-500/20">
          <Sparkles size={26} />
        </span>
        <h1 className="relative mt-5 text-3xl font-semibold tracking-tight">{welcome ? 'Let’s plan your first results' : returning ? 'Plan your next results' : 'Strategy interview'}</h1>
        <p className="relative mt-2 max-w-lg text-zinc-600">
          A short chat about {company} — about 3 minutes. {returning ? 'Only what changed or is missing is asked again. ' : ''}At the end you get goals and a ready plan to launch.
        </p>

        {phase === 'idle' ? (
          <>
            <ul className="relative mt-7 grid gap-3 sm:grid-cols-3">
              {FEATURES.map((f) => (
                <li key={f.title} className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-100">
                  <f.icon size={18} className="text-[#7b3ff2]" />
                  <p className="mt-2 text-sm font-semibold">{f.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{f.text}</p>
                </li>
              ))}
            </ul>
            <div className="relative mt-7 flex flex-wrap items-center gap-3">
              <button
                onClick={() => (setError(undefined), setPhase('site'))}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7b3ff2] via-[#ff2e6e] to-[#ff5b14] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-fuchsia-500/20 transition hover:brightness-110"
              >
                {resumeId ? 'Start over' : 'Start the interview'} <ArrowRight size={16} />
              </button>
              {resumeId && (
                <Link href={`/app/strategy/interview/${resumeId}`} className="rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold hover:bg-zinc-50">
                  Continue where you left off
                </Link>
              )}
              <label className="ml-auto flex items-center gap-2 text-sm text-zinc-500">
                Questions in
                <select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)} aria-label="Interview language" className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-zinc-800">
                  {LANGUAGES.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
            </div>
            {error && (
              <p role="alert" className="relative mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <p className="relative mt-6 text-xs text-zinc-400">
              {welcome ? (
                <Link href="/app" className="underline hover:text-zinc-600">
                  Skip for now
                </Link>
              ) : (
                <Link href="/app/strategy/new" className="underline hover:text-zinc-600">
                  Use the quick form instead
                </Link>
              )}{' '}
              · Only your team sees these answers.
            </p>
          </>
        ) : (
          <ul className="relative mt-7 space-y-2.5" aria-live="polite">
            {steps.map((s, i) => {
              const active = (phase === 'site' && i === 0) || (phase === 'compose' && i > 0)
              return (
                <li key={s.label} className="chat-rise flex items-center gap-3 rounded-2xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-100" style={{ animationDelay: `${i * 120}ms` }}>
                  {s.done ? (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                      <Check size={14} />
                    </span>
                  ) : active ? (
                    <Loader2 size={20} className="mx-0.5 animate-spin text-[#7b3ff2]" />
                  ) : (
                    <span className="mx-1.5 h-3 w-3 rounded-full bg-zinc-200" />
                  )}
                  <span className={`text-sm font-medium ${active || s.done ? 'text-zinc-800' : 'text-zinc-400'}`}>{s.label}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
