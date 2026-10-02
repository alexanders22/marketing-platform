'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarClock,
  Check,
  Copy,
  FileText,
  Hash,
  Image as ImageIcon,
  LayoutTemplate,
  Megaphone,
  PartyPopper,
  Rocket,
  Sparkles,
  Target,
  Type,
  Zap,
} from 'lucide-react'
import type { GeneratedPost } from '@/lib/ai'
import { createPost } from './actions'

const TONES = ['Professional', 'Friendly', 'Playful', 'Bold', 'Premium'] as const
const LENGTHS = ['Short', 'Medium', 'Long'] as const
const LANGS = ['English', 'Georgian', 'Russian'] as const

const SUGGESTIONS = [
  {
    icon: Rocket,
    tint: 'bg-violet-50 text-violet-600',
    title: 'New product launch',
    body: 'New product launch. Announce the product, the problem it solves and where to get it.',
  },
  {
    icon: Megaphone,
    tint: 'bg-rose-50 text-rose-600',
    title: 'Limited-time offer',
    body: 'Limited-time offer. Say what the deal is and exactly when it ends.',
  },
  {
    icon: PartyPopper,
    tint: 'bg-emerald-50 text-emerald-600',
    title: 'Event invitation',
    body: 'Event invitation. Invite people in with the date, time and location.',
  },
]

const cycle = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length]

export function Composer({ credits }: { credits: number }) {
  const [prompt, setPrompt] = useState('')
  const [hashtags, setHashtags] = useState(true)
  const [tone, setTone] = useState<(typeof TONES)[number]>('Professional')
  const [length, setLength] = useState<(typeof LENGTHS)[number]>('Medium')
  const [language, setLanguage] = useState<(typeof LANGS)[number]>('English')
  const [result, setResult] = useState<GeneratedPost>()
  const [error, setError] = useState<string>()
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  const submit = () => {
    if (!prompt.trim() || pending) return
    setError(undefined)
    start(async () => {
      const res = await createPost({ prompt, tone, length, hashtags, language })
      if (res.error) setError(res.error)
      else setResult(res.post)
    })
  }

  const fullText = result ? [result.caption, result.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n') : ''

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 -top-8 h-72 bg-[radial-gradient(600px_220px_at_50%_0%,rgba(16,185,129,0.10),transparent)]" />
      <div className="relative">
        <Link href="/app/planner" className="inline-grid h-10 w-10 place-items-center rounded-lg bg-zinc-100 hover:bg-zinc-200" aria-label="Back">
          <ArrowLeft size={18} />
        </Link>

        <div className="mx-auto mt-2 max-w-3xl">
          <div className="mx-auto flex w-fit rounded-lg bg-zinc-100 p-1 text-sm">
            <span className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 font-semibold shadow-sm">
              <Sparkles size={15} /> Social post
            </span>
            <span className="inline-flex cursor-not-allowed items-center gap-2 px-3 py-1.5 text-zinc-500" title="Coming soon">
              <FileText size={15} /> Blog article
              <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">SOON</span>
            </span>
          </div>

          <div className="mt-8 flex items-center justify-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sky-600">
              <Sparkles size={20} />
            </span>
            <h1 className="text-2xl font-semibold sm:text-3xl">What should we post?</h1>
          </div>
          <p className="mt-2 text-center text-zinc-500">
            Turn a simple idea into a polished, on-brand social post ready to refine and publish.
          </p>

          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
              }}
              placeholder="Describe the post you want Khma to create…"
              className="min-h-36 w-full resize-none rounded-t-2xl px-5 py-4 text-[15px] outline-none placeholder:text-zinc-400"
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-3 py-2.5">
              <Chip active={hashtags} onClick={() => setHashtags(!hashtags)} icon={Hash}>
                Hashtags
              </Chip>
              <Chip icon={ImageIcon} disabled title="Image generation is coming soon">
                Images
              </Chip>
              <Chip icon={Target} onClick={() => setTone(cycle(TONES, tone))} active>
                {tone}
              </Chip>
              <Chip icon={Type} onClick={() => setLength(cycle(LENGTHS, length))} active>
                {length}
              </Chip>
              <Chip onClick={() => setLanguage(cycle(LANGS, language))} active>
                {language}
              </Chip>
              <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700" title="Credits per post">
                <Zap size={13} /> 1
              </span>
              <button
                onClick={submit}
                disabled={!prompt.trim() || pending}
                className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-white transition hover:bg-zinc-700 disabled:bg-zinc-200 disabled:text-zinc-400"
                aria-label="Generate"
              >
                {pending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <ArrowUp size={18} />}
              </button>
            </div>
          </div>
          <p className="mt-2 text-right text-xs text-zinc-400">{credits.toLocaleString()} credits left</p>

          {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          {result && (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-emerald-800">Your post</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(fullText)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                  </button>
                  <span
                    className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm text-zinc-500"
                    title="Connect a channel to schedule"
                  >
                    <CalendarClock size={14} /> Schedule
                  </span>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{result.caption}</p>
              {result.hashtags.length > 0 && (
                <p className="mt-3 text-[15px] text-sky-700">{result.hashtags.map((h) => `#${h}`).join(' ')}</p>
              )}
            </div>
          )}

          <h2 className="mt-10 mb-3 text-sm text-zinc-500">Suggestions</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.title}
                onClick={() => setPrompt(s.body)}
                className="flex gap-3 rounded-xl border border-zinc-200 p-4 text-left transition hover:border-zinc-300 hover:shadow-sm"
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${s.tint}`}>
                  <s.icon size={17} />
                </span>
                <span>
                  <span className="block font-semibold">{s.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-zinc-500">{s.body}</span>
                </span>
              </button>
            ))}
          </div>

          <h2 className="mt-10 mb-3 text-sm text-zinc-500">Other options</h2>
          <div className="space-y-3">
            <Option
              icon={Target}
              tint="bg-indigo-50 text-indigo-600"
              title="Planning multiple posts?"
              body="Turn this idea into a coordinated campaign with multiple scheduled posts."
              cta="Create a campaign"
              href="/app/campaigns"
              color="text-indigo-600"
            />
            <Option
              icon={LayoutTemplate}
              tint="bg-rose-50 text-rose-600"
              title="Want to design it yourself?"
              body="Start from a template and customise it in Studio."
              cta="Open Studio"
              href="/app/studio"
              color="text-rose-600"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Chip({
  children,
  icon: Icon,
  active,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode
  icon?: typeof Hash
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
        disabled
          ? 'cursor-not-allowed border-zinc-100 text-zinc-400'
          : active
            ? 'border-zinc-200 text-zinc-800 hover:bg-zinc-50'
            : 'border-zinc-100 text-zinc-400 line-through decoration-zinc-300 hover:bg-zinc-50'
      }`}
    >
      {Icon && <Icon size={15} />}
      {children}
    </button>
  )
}

function Option({
  icon: Icon,
  tint,
  title,
  body,
  cta,
  href,
  color,
}: {
  icon: typeof Target
  tint: string
  title: string
  body: string
  cta: string
  href: string
  color: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 sm:flex-row sm:items-center">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${tint}`}>
        <Icon size={18} />
      </span>
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-zinc-500">{body}</p>
      </div>
      <Link href={href} className={`inline-flex items-center gap-1.5 text-sm font-semibold ${color}`}>
        {cta} <ArrowRight size={15} />
      </Link>
    </div>
  )
}
