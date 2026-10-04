'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowLeft, FileText, Loader2, Target, Zap } from 'lucide-react'
import { ChannelPicker, type Network } from '@/components/channels'
import { createBlogCampaign, createSocialCampaign } from '../actions'
import { audienceLine, BriefAssistant } from '@/components/BriefAssistant'

const TONES = ['Professional', 'Friendly', 'Educational', 'Bold', 'Founder-led'] as const
const LANGS = ['English', 'Georgian', 'Russian'] as const

const localDay = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const tomorrow = () => localDay(1)

const input = 'w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100'

export function CampaignWizard({ kind, credits }: { kind: 'social' | 'blog'; credits: number }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [brief, setBrief] = useState('')
  const [startsOn, setStartsOn] = useState(tomorrow)
  const [today] = useState(() => localDay(0))
  const [time, setTime] = useState('10:00')
  const [weeks, setWeeks] = useState(2)
  const [perWeek, setPerWeek] = useState(kind === 'blog' ? 1 : 3)
  const [count, setCount] = useState(4)
  const [tone, setTone] = useState<(typeof TONES)[number]>(kind === 'blog' ? 'Educational' : 'Friendly')
  const [language, setLanguage] = useState<(typeof LANGS)[number]>('English')
  const [channels, setChannels] = useState<Network[]>(['FACEBOOK', 'INSTAGRAM'])
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()

  const total = kind === 'blog' ? count : weeks * perWeek
  const cost = total // 1 credit per post / per article outline

  const submit = () =>
    start(async () => {
      setError(undefined)
      const base = { name, brief, startsOn, time, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, tone, language }
      const res =
        kind === 'blog'
          ? await createBlogCampaign({ ...base, count, perWeek })
          : await createSocialCampaign({ ...base, weeks, postsPerWeek: perWeek, channels })
      if (res.error) setError(res.error)
      else router.push(`/app/campaigns/${res.id}`)
    })

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/campaigns" className="inline-grid h-10 w-10 place-items-center rounded-lg bg-zinc-100 hover:bg-zinc-200" aria-label="Back">
        <ArrowLeft size={18} />
      </Link>
      <div className="mt-2 text-center">
        <span className={`mx-auto grid h-12 w-12 place-items-center rounded-xl ${kind === 'blog' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
          {kind === 'blog' ? <FileText size={22} /> : <Target size={22} />}
        </span>
        <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">{kind === 'blog' ? 'New AI blog campaign' : 'New AI social campaign'}</h1>
        <p className="mt-2 text-zinc-500">
          {kind === 'blog'
            ? 'Loudpilot plans a series of articles with titles and outlines, then writes each one when you are ready.'
            : 'One goal in — a full run of on-brand posts, each with its own angle, placed into your Planner.'}
        </p>
      </div>

      <div className="mt-8 space-y-5">
        {kind !== 'blog' && (
          <BriefAssistant
            kind="campaign"
            defaultOpen={false}
            onUse={(idea, audience) => {
              setName(idea.title.slice(0, 80))
              setBrief([idea.prompt, audienceLine(audience)].filter(Boolean).join('\n'))
            }}
          />
        )}
        <Field label="Campaign name">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'blog' ? 'Spring guides' : 'Summer sale'} />
        </Field>
        <Field label="Goal and details" hint="What you promote, for whom, the offer and any dates. The AI only uses facts you give here and in your brand kit.">
          <textarea
            className={`${input} min-h-28 resize-y`}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={
              kind === 'blog'
                ? 'Practical guides for people planning a trip to Tbilisi: neighbourhoods, food, day trips.'
                : '15% off all weekend stays booked before 30 June. Target couples in Tbilisi and Batumi.'
            }
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Start date">
            <input type="date" className={input} value={startsOn} min={today} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label="Posting time">
            <input type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>

        {kind === 'blog' ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Stepper label="Articles" value={count} min={2} max={12} onChange={setCount} />
            <Stepper label="Articles per week" value={perWeek} min={1} max={3} onChange={setPerWeek} />
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <Stepper label="Duration (weeks)" value={weeks} min={1} max={8} onChange={setWeeks} />
            <Stepper label="Posts per week" value={perWeek} min={1} max={7} onChange={setPerWeek} />
          </div>
        )}

        {kind === 'social' && (
          <Field label="Channels" group>
            <ChannelPicker value={channels} onChange={setChannels} />
          </Field>
        )}

        <Field label="Tone" group>
          <Pills options={TONES} value={tone} onChange={setTone} />
        </Field>
        <Field label="Language" group>
          <Pills options={LANGS} value={language} onChange={setLanguage} />
        </Field>
      </div>

      {error && <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-5">
        <span className="inline-flex items-center gap-1 text-sm text-zinc-500">
          <Zap size={14} className="text-amber-500" />
          {total} {kind === 'blog' ? 'article outlines' : 'posts'} · {cost} credit{cost === 1 ? '' : 's'} · {credits.toLocaleString()} left
        </span>
        <button
          onClick={submit}
          disabled={pending || !name.trim() || brief.trim().length < 10}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          {pending && <Loader2 size={15} className="animate-spin" />}
          {pending ? 'Planning… up to a minute' : kind === 'blog' ? 'Plan the series' : 'Create campaign'}
        </button>
      </div>
    </div>
  )
}

// `group` = a set of buttons: a <label> around them would make a click on
// the heading press the first button, so groups use role="group" instead.
function Field({ label, hint, group, children }: { label: string; hint?: string; group?: boolean; children: React.ReactNode }) {
  const body = (
    <>
      <span className="text-sm font-semibold">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-zinc-500">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </>
  )
  return group ? (
    <div role="group" aria-label={label} className="block">
      {body}
    </div>
  ) : (
    <label className="block">{body}</label>
  )
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div>
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-1.5 flex items-center overflow-hidden rounded-lg border border-zinc-200">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="px-4 py-2 text-lg hover:bg-zinc-50" aria-label={`Fewer ${label}`}>
          −
        </button>
        <span className="flex-1 text-center font-semibold">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="px-4 py-2 text-lg hover:bg-zinc-50" aria-label={`More ${label}`}>
          +
        </button>
      </div>
    </div>
  )
}

function Pills<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`rounded-lg border px-3 py-2 text-sm transition ${value === o ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:border-zinc-400'}`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}
