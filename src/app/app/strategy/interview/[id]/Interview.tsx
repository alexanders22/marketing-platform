'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { AlertTriangle, ArrowRight, BarChart3, Check, Lightbulb, Loader2, Lock, Pencil, Sparkles, Undo2 } from 'lucide-react'
import { usePrices } from '@/components/Prices'
import { creditsLabel } from '@/lib/pricing'
import {
  CHAPTERS,
  economics,
  insightAfter,
  money,
  planTarget,
  realityCheck,
  type Answer,
  type GoalAnswer,
  type Insight,
  type InterviewData,
  type Objective,
  type Option,
  type Question,
} from '@/lib/interview'
import { answerQuestion, buildFromInterview, confirmKnown, undoAnswer } from '../actions'

type Draft = Partial<Omit<GoalAnswer, 'stretch'>> & { stretch: boolean }
type GoalStep = 'objective' | 'target' | 'months' | 'budget' | 'focus' | 'summary'

const BRAND = 'bg-gradient-to-r from-[#7b3ff2] via-[#ff2e6e] to-[#ff5b14]'
const BUILDING = ['Studying your numbers', 'Choosing audiences', 'Splitting the budget', 'Writing the first posts', 'Setting goals to watch']

export function Interview({ id, company, initial, planId: donePlan }: { id: string; company: string; initial: InterviewData; planId: string | null }) {
  const P = usePrices()
  const router = useRouter()
  const [data, setData] = useState(initial)
  const [draft, setDraft] = useState<Draft>(() => (initial.goal ? { ...initial.goal } : { stretch: false }))
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState<string>()
  const [building, setBuilding] = useState(false)
  const [buildStep, setBuildStep] = useState(0)
  const [, start] = useTransition()
  const end = useRef<HTMLDivElement>(null)

  const { currency } = data
  const m = (x: number) => money(x, currency)
  const qs = data.questions
  const knownDone = data.confirmed !== null || data.known.length === 0
  const current = knownDone ? (qs.find((q) => !data.answers[q.key]) ?? null) : null
  const lastAnswered = [...qs].reverse().find((q) => data.answers[q.key])
  const leads = draft.objective === 'SALES' || draft.objective === 'LEADS'
  const goalSteps: GoalStep[] = ['objective', 'months', ...(leads || !draft.objective ? (['target'] as const) : []), 'budget', ...(data.offerings.length ? (['focus'] as const) : []), 'summary']
  const field = (s: GoalStep) => (s === 'budget' ? 'monthlyBudget' : s) as keyof Draft
  const goalStep = !knownDone || current ? null : (goalSteps.find((s) => s === 'summary' || draft[field(s)] === undefined) ?? 'summary')
  const chapter = !knownDone ? 0 : current ? CHAPTERS.findIndex((c) => c.id === current.chapter) : 3
  const total = 1 + qs.length + goalSteps.length - 1
  const done = (knownDone ? 1 : 0) + qs.filter((q) => data.answers[q.key]).length + (goalStep ? goalSteps.indexOf(goalStep) : 0)

  // Keep the newest message in view (after the new bubbles have laid out).
  useEffect(() => {
    const t = setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 60)
    return () => clearTimeout(t)
  }, [data, draft, typing, building])

  useEffect(() => {
    if (!building) return
    const t = setInterval(() => setBuildStep((s) => Math.min(s + 1, BUILDING.length - 1)), 9000)
    return () => clearInterval(t)
  }, [building])

  const think = () => {
    setTyping(true)
    setTimeout(() => setTyping(false), 600)
  }

  const confirm = (ok: boolean, correction = '') => {
    setError(undefined)
    start(async () => {
      const res = await confirmKnown(id, ok, correction)
      if (res.error || !res.data) return setError(res.error)
      think()
      setData(res.data)
    })
  }

  const answer = (q: Question, a: Answer) => {
    setError(undefined)
    const before = data
    setData({ ...data, answers: { ...data.answers, [q.key]: a } })
    think()
    start(async () => {
      const res = await answerQuestion(id, { key: q.key, value: a.value, label: a.label, source: a.source })
      if (res.error) {
        setData(before)
        setError(res.error)
      }
    })
  }

  const undo = () => {
    if (!lastAnswered) return
    setError(undefined)
    start(async () => {
      const res = await undoAnswer(id, lastAnswered.key)
      if (res.data) setData(res.data)
    })
  }

  const setGoal = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    think()
  }

  const build = () => {
    const g = draft as GoalAnswer
    setError(undefined)
    setBuilding(true)
    setBuildStep(0)
    start(async () => {
      const res = await buildFromInterview(id, { ...g, focus: g.focus ?? [] }, Intl.DateTimeFormat().resolvedOptions().timeZone)
      if (res.error || !res.planId) {
        setBuilding(false)
        return setError(res.error)
      }
      router.push(`/app/strategy/${res.planId}`)
    })
  }

  // Insights use only the answers given up to that question.
  const insightAt = (i: number) => {
    const upTo = { ...data, answers: Object.fromEntries(Object.entries(data.answers).filter(([k]) => qs.findIndex((q) => q.key === k) <= i)) }
    return insightAfter(qs[i].key, upTo)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="sticky top-0 z-10 -mx-1 rounded-2xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-zinc-200/70 backdrop-blur">
        <div className="flex items-center gap-3">
          <Avatar />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Pilot · strategy interview</p>
            <p className="truncate text-xs text-zinc-500">{company}</p>
          </div>
          {lastAnswered && !goalStep && !donePlan && (
            <button onClick={undo} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100" aria-label="Change the last answer">
              <Undo2 size={13} /> Back
            </button>
          )}
        </div>
        <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Chapters">
          {CHAPTERS.map((c, i) => (
            <li key={c.id} className={`inline-flex items-center gap-1 ${donePlan || i < chapter ? 'text-emerald-600' : i === chapter ? 'font-semibold text-[#7b3ff2]' : 'text-zinc-400'}`} aria-current={i === chapter ? 'step' : undefined}>
              {donePlan || i < chapter ? <Check size={12} /> : <span className="tabular-nums">{i + 1}</span>} {c.label}
            </li>
          ))}
        </ol>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-label="Interview progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={donePlan ? total : done}>
          <div className={`h-full rounded-full ${BRAND} transition-[width] duration-500`} style={{ width: `${donePlan ? 100 : Math.max(4, (done / total) * 100)}%` }} />
        </div>
      </header>

      <div className="mt-5 space-y-3" aria-live="polite">
        <Bot>
          {data.known.length
            ? `Hi! I’m Pilot. I’ve looked at what ${company} has online${data.costs.source === 'ads' ? ' and your ads' : ''}. Is this right?`
            : `Hi! I’m Pilot. A few quick questions about ${company}, then I’ll build your plan.`}
        </Bot>
        {data.known.length > 0 && <KnownCard known={data.known} />}
        {data.known.length > 0 && data.confirmed === null && <ConfirmControls onConfirm={confirm} />}
        {data.confirmed === true && <Me>Yes, that’s right</Me>}
        {data.confirmed === false && <Me>{data.correction}</Me>}

        {knownDone &&
          qs.map((q, i) => {
            const a = data.answers[q.key]
            if (!a && q !== current) return null
            if (!a && typing) return null
            const insight = a && a.source !== 'SKIPPED' ? insightAt(i) : null
            return (
              <div key={q.key} className="space-y-3">
                <Bot hint={q.hint}>{q.text}</Bot>
                {a ? <Me muted={a.source === 'SKIPPED'}>{a.source === 'SKIPPED' ? 'Skipped' : a.label}</Me> : <AnswerControls q={q} currency={currency} onAnswer={(x) => answer(q, x)} />}
                {insight && <InsightCard insight={insight} />}
              </div>
            )
          })}

        {goalStep && (
          <GoalChat
            data={data}
            draft={draft}
            step={goalStep}
            steps={goalSteps}
            typing={typing}
            onSet={setGoal}
            m={m}
            build={build}
            building={building}
            buildStep={buildStep}
            credits={creditsLabel(P.strategy)}
            donePlan={donePlan}
          />
        )}

        {typing && <Typing />}
        {error && (
          <p role="alert" className="chat-rise rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div ref={end} />
      </div>

      <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-zinc-400">
        <Lock size={12} /> Only your team sees these answers. They make every plan and post smarter.
      </p>
    </div>
  )
}

/* ─── Pieces ───────────────────────────────────────────────────────────── */

function Avatar() {
  return (
    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${BRAND} text-white shadow-sm`}>
      <Sparkles size={15} />
    </span>
  )
}

function Bot({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="chat-rise flex items-end gap-2">
      <Avatar />
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-[15px] leading-relaxed text-zinc-800 shadow-sm ring-1 ring-zinc-200/80">
        {children}
        {hint && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-zinc-500">
            <BarChart3 size={13} className="mt-px shrink-0 text-[#7b3ff2]" /> {hint}
          </p>
        )}
      </div>
    </div>
  )
}

function Me({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="chat-rise flex justify-end">
      <div className={`max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] ${muted ? 'bg-zinc-100 text-zinc-500 italic' : 'bg-[#7b3ff2] text-white shadow-sm shadow-violet-500/20'}`}>{children}</div>
    </div>
  )
}

function Typing() {
  return (
    <div className="chat-rise flex items-end gap-2" aria-label="Pilot is typing">
      <Avatar />
      <div className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3.5 shadow-sm ring-1 ring-zinc-200/80">
        {[0, 1, 2].map((i) => (
          <span key={i} className="chat-dot h-1.5 w-1.5 rounded-full bg-zinc-400" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  )
}

function KnownCard({ known }: { known: InterviewData['known'] }) {
  return (
    <div className="chat-rise ml-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/80 sm:ml-10">
      <p className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-2 text-xs font-semibold tracking-wide text-zinc-500">WHAT WE ALREADY KNOW</p>
      <dl className="divide-y divide-zinc-100" aria-label="What we already know">
        {known.map((k) => (
          <div key={k.label + k.text} className="grid gap-0.5 px-4 py-2 text-sm sm:grid-cols-[7.5rem_1fr] sm:gap-3">
            <dt className="text-xs text-zinc-500 sm:text-sm">{k.label}</dt>
            <dd className="text-zinc-800">{k.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

const chip = 'rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-sm text-zinc-800 shadow-sm transition hover:border-[#7b3ff2]/40 hover:bg-violet-50 disabled:opacity-50'
const chipOn = 'rounded-full border border-[#7b3ff2]/50 bg-violet-50 px-3.5 py-1.5 text-sm text-[#5b2bc0] shadow-sm'
const ghostChip = 'rounded-full border border-dashed border-zinc-300 px-3.5 py-1.5 text-sm text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700'

function ConfirmControls({ onConfirm }: { onConfirm: (ok: boolean, correction?: string) => void }) {
  const [fixing, setFixing] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  if (fixing)
    return (
      <form
        className="chat-rise ml-10 space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return setErr('Say what is different')
          onConfirm(false, text)
        }}
      >
        <textarea
          value={text}
          onChange={(e) => (setText(e.target.value), setErr(''))}
          rows={3}
          autoFocus
          aria-label="What is different"
          placeholder="We mostly work with online shops, prices start at 5 ₾…"
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-[#7b3ff2]/50 focus:ring-2 focus:ring-violet-100"
        />
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button className={`${chip} border-[#7b3ff2] bg-[#7b3ff2] text-white hover:bg-[#6a32d8]`}>Send</button>
          <button type="button" onClick={() => setFixing(false)} className={ghostChip}>
            Cancel
          </button>
        </div>
      </form>
    )
  return (
    <div className="chat-rise ml-10 flex flex-wrap gap-2">
      <button onClick={() => onConfirm(true)} className={chip}>
        <Check size={14} className="-mt-0.5 mr-1 inline text-emerald-600" />
        Yes, that’s right
      </button>
      <button onClick={() => setFixing(true)} className={chip}>
        <Pencil size={13} className="-mt-0.5 mr-1 inline text-zinc-500" />
        Fix something
      </button>
    </div>
  )
}

function fmt(q: Pick<Question, 'kind'>, value: number, currency: string) {
  if (q.kind === 'money') return money(value, currency)
  if (q.kind === 'percent') return `${Math.round(value)}%`
  return value >= 100_000 ? 'No real limit' : String(Math.round(value))
}

function AnswerControls({ q, currency, onAnswer }: { q: Question; currency: string; onAnswer: (a: Answer) => void }) {
  const [picked, setPicked] = useState<Option[]>([])
  const [other, setOther] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const numeric = q.kind === 'money' || q.kind === 'number' || q.kind === 'percent'
  const skip = () => onAnswer({ value: null, label: 'Skipped', source: 'SKIPPED' })
  const notSure =
    q.estimate !== null && q.kind !== 'text' && q.kind !== 'multi'
      ? () =>
          onAnswer({
            value: numeric ? Number(q.estimate) : String(q.estimate),
            label: `Not sure — about ${numeric ? fmt(q, Number(q.estimate), currency) : (q.options.find((o) => o.value === q.estimate)?.label ?? q.estimate)}`,
            source: 'ESTIMATE',
          })
      : null

  if (q.kind === 'text' || other) {
    const submit = (e: React.FormEvent) => {
      e.preventDefault()
      if (q.kind === 'text') {
        if (!text.trim()) return setErr('Type an answer or skip')
        return onAnswer({ value: text.trim(), label: text.trim(), source: 'OWNER' })
      }
      const n = Number(text.replace(',', '.').replace(/[^\d.]/g, ''))
      if (!text.trim() || !Number.isFinite(n) || n < 0 || (q.kind === 'percent' && n > 100)) return setErr(q.kind === 'percent' ? 'Enter a percent from 0 to 100' : 'Enter a number')
      onAnswer({ value: n, label: fmt(q, n, currency), source: 'OWNER' })
    }
    return (
      <form onSubmit={submit} className="chat-rise ml-10 space-y-2">
        <div className="flex gap-2">
          {q.kind === 'text' ? (
            <textarea value={text} onChange={(e) => (setText(e.target.value), setErr(''))} rows={2} autoFocus aria-label="Your answer" className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-[#7b3ff2]/50 focus:ring-2 focus:ring-violet-100" />
          ) : (
            <input
              value={text}
              onChange={(e) => (setText(e.target.value), setErr(''))}
              inputMode="decimal"
              autoFocus
              aria-label="Your answer"
              placeholder={q.kind === 'money' ? `Amount in ${currency}` : q.kind === 'percent' ? 'Percent' : 'Number'}
              className="w-40 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm shadow-sm outline-none focus:border-[#7b3ff2]/50 focus:ring-2 focus:ring-violet-100"
            />
          )}
          <button className="self-end rounded-full bg-[#7b3ff2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6a32d8]">Send</button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div className="flex gap-2">
          {other && (
            <button type="button" onClick={() => setOther(false)} className={ghostChip}>
              Back to choices
            </button>
          )}
          <button type="button" onClick={skip} className={ghostChip}>
            Skip
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="chat-rise ml-10 space-y-2">
      <div className="flex flex-wrap gap-2">
        {q.options.map((o) => {
          const on = picked.includes(o)
          return (
            <button
              key={`${o.label}${o.value}`}
              aria-pressed={q.kind === 'multi' ? on : undefined}
              onClick={() =>
                q.kind === 'multi'
                  ? setPicked(on ? picked.filter((x) => x !== o) : [...picked, o])
                  : onAnswer({ value: o.value, label: o.label, source: 'OWNER' })
              }
              className={on ? chipOn : chip}
            >
              {on && <Check size={13} className="-mt-0.5 mr-1 inline" />}
              {o.label}
            </button>
          )
        })}
        {numeric && (
          <button onClick={() => setOther(true)} className={ghostChip}>
            Other…
          </button>
        )}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {q.kind === 'multi' && (
          <button
            onClick={() => (picked.length ? onAnswer({ value: picked.map((p) => String(p.value)), label: picked.map((p) => p.label).join(', '), source: 'OWNER' }) : setErr('Pick at least one'))}
            className="rounded-full bg-[#7b3ff2] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#6a32d8]"
          >
            Done
          </button>
        )}
        {notSure && (
          <button onClick={notSure} className={ghostChip}>
            Not sure
          </button>
        )}
        <button onClick={skip} className={ghostChip}>
          Skip
        </button>
      </div>
    </div>
  )
}

function InsightCard({ insight, inset = true }: { insight: Insight; inset?: boolean }) {
  const tone = {
    good: 'bg-emerald-50 text-emerald-900 ring-emerald-200/70',
    warn: 'bg-amber-50 text-amber-900 ring-amber-200/70',
    info: 'bg-violet-50 text-violet-950 ring-violet-200/70',
  }[insight.tone]
  const Icon = insight.tone === 'warn' ? AlertTriangle : Lightbulb
  return (
    <div className={`chat-rise ${inset ? 'ml-10' : ''} flex gap-2.5 rounded-2xl px-4 py-3 text-sm leading-relaxed ring-1 ${tone}`} role="note">
      <Icon size={16} className="mt-0.5 shrink-0" />
      <p>{insight.text}</p>
    </div>
  )
}

/* ─── Goals chapter ────────────────────────────────────────────────────── */

const OBJECTIVES: { id: Objective; label: (customers: string) => string }[] = [
  { id: 'SALES', label: (c) => `New ${c}` },
  { id: 'LEADS', label: () => 'More enquiries' },
  { id: 'TRAFFIC', label: () => 'Website visits' },
  { id: 'AWARENESS', label: () => 'Get known' },
  { id: 'ENGAGEMENT', label: () => 'Engagement and followers' },
]

function GoalChat({
  data,
  draft,
  step,
  steps,
  typing,
  onSet,
  m,
  build,
  building,
  buildStep,
  credits,
  donePlan,
}: {
  data: InterviewData
  draft: Draft
  step: GoalStep
  steps: GoalStep[]
  typing: boolean
  onSet: (p: Partial<Draft>) => void
  m: (x: number) => string
  build: () => void
  building: boolean
  buildStep: number
  credits: string
  donePlan: string | null
}) {
  const { customers } = data.vocabulary
  const what = draft.objective === 'LEADS' ? 'enquiries' : `new ${customers}`
  const reached = steps.indexOf(step)
  const [other, setOther] = useState<'target' | 'budget' | null>(null)
  const [num, setNum] = useState('')
  const [err, setErr] = useState('')
  const [focus, setFocus] = useState<string[]>(draft.focus ?? [])

  const ask: Record<GoalStep, string> = {
    objective: 'Now the goal. What should advertising bring you first?',
    target: `How many ${what} would you like in ${draft.months ?? 1} month${(draft.months ?? 1) > 1 ? 's' : ''}?`,
    months: 'Over what period?',
    budget: `What can you spend on ads per month?${data.adSpendMonthly ? ` You spent about ${m(data.adSpendMonthly)} in the last 30 days.` : ''}`,
    focus: 'Anything to focus on?',
    summary: 'Here is the goal. I’ll build the plan around it.',
  }
  const said: Partial<Record<GoalStep, string>> = {
    objective: OBJECTIVES.find((o) => o.id === draft.objective)?.label(customers),
    target: draft.target ? `${draft.target} ${what}` : undefined,
    months: draft.months ? `${draft.months} month${draft.months > 1 ? 's' : ''}` : undefined,
    budget: draft.monthlyBudget === null ? 'No ads for now — posts only' : draft.monthlyBudget ? `${m(draft.monthlyBudget)} a month` : undefined,
    focus: draft.focus ? (draft.focus.length ? draft.focus.join(', ') : 'Everything') : undefined,
  }

  // Suggested targets: shares of what the owner can take on, else small steps.
  const cap = economics(data).capacity
  const targets =
    cap !== null && cap < 1000 && draft.months
      ? [...new Set([0.1, 0.25, 0.5, 1].map((f) => nice(cap * draft.months! * f)))].filter((n) => n > 0)
      : [5, 10, 20, 50]
  const budgets = [...new Set([data.adSpendMonthly ?? 0, 300, 500, 1000, 2000].filter((x) => x > 0))].sort((a, b) => a - b).slice(0, 5)

  const submitOther = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Math.round(Number(num.replace(',', '.').replace(/[^\d.]/g, '')))
    if (!num.trim() || !Number.isFinite(n) || n < 1) return setErr('Enter a number')
    onSet(other === 'target' ? { target: n } : { monthlyBudget: n })
    setOther(null)
    setNum('')
  }

  const controls = (s: GoalStep) => {
    if (s === 'objective')
      return OBJECTIVES.map((o) => (
        <button key={o.id} onClick={() => onSet({ objective: o.id, ...(o.id === 'SALES' || o.id === 'LEADS' ? {} : { target: null }) })} className={chip}>
          {o.label(customers)}
        </button>
      ))
    if (s === 'months')
      return ([1, 2, 3] as const).map((n) => (
        <button key={n} onClick={() => onSet({ months: n })} className={chip}>
          {n} month{n > 1 ? 's' : ''}
        </button>
      ))
    if (s === 'focus')
      return (
        <>
          {data.offerings.map((o) => {
            const on = focus.includes(o)
            return (
              <button key={o} aria-pressed={on} onClick={() => setFocus(on ? focus.filter((x) => x !== o) : [...focus, o])} className={on ? chipOn : chip}>
                {on && <Check size={13} className="-mt-0.5 mr-1 inline" />}
                {o}
              </button>
            )
          })}
          <button onClick={() => onSet({ focus })} className="rounded-full bg-[#7b3ff2] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#6a32d8]">
            {focus.length ? 'Done' : 'Everything'}
          </button>
        </>
      )
    if (other === s)
      return (
        <form onSubmit={submitOther} className="flex flex-wrap items-center gap-2">
          <input
            value={num}
            onChange={(e) => (setNum(e.target.value), setErr(''))}
            inputMode="numeric"
            autoFocus
            aria-label={s === 'target' ? 'Target' : 'Monthly budget'}
            placeholder={s === 'budget' ? `Amount in ${data.currency}` : 'Number'}
            className="w-40 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm shadow-sm outline-none focus:border-[#7b3ff2]/50 focus:ring-2 focus:ring-violet-100"
          />
          <button className="rounded-full bg-[#7b3ff2] px-4 py-2 text-sm font-semibold text-white">Send</button>
          <button type="button" onClick={() => setOther(null)} className={ghostChip}>
            Back to choices
          </button>
          {err && <span className="text-xs text-red-600">{err}</span>}
        </form>
      )
    if (s === 'target')
      return (
        <>
          {targets.map((n) => (
            <button key={n} onClick={() => onSet({ target: n })} className={chip}>
              {n}
            </button>
          ))}
          <button onClick={() => setOther('target')} className={ghostChip}>
            Other…
          </button>
        </>
      )
    if (s === 'budget')
      return (
        <>
          {budgets.map((n) => (
            <button key={n} onClick={() => onSet({ monthlyBudget: n })} className={chip}>
              {m(n)}
            </button>
          ))}
          <button onClick={() => setOther('budget')} className={ghostChip}>
            Other…
          </button>
          <button onClick={() => onSet({ monthlyBudget: null })} className={ghostChip}>
            No ads, posts only
          </button>
        </>
      )
    return null
  }

  return (
    <>
      {steps.slice(0, reached + 1).map((s) => {
        if (s === step && typing) return null
        return (
          <div key={s} className="space-y-3">
            <Bot>{ask[s]}</Bot>
            {s === 'summary' ? (
              <Summary data={data} draft={draft as GoalAnswer} m={m} onSet={onSet} build={build} building={building} buildStep={buildStep} credits={credits} donePlan={donePlan} />
            ) : s !== step && said[s] ? (
              <Me>{said[s]}</Me>
            ) : (
              <div className="chat-rise ml-10 flex flex-wrap gap-2">{controls(s)}</div>
            )}
          </div>
        )
      })}
    </>
  )
}

// 7 → 7, 37 → 35, 240 → 250.
const nice = (n: number) => (n < 10 ? Math.max(1, Math.round(n)) : n < 100 ? Math.round(n / 5) * 5 : Math.round(n / 50) * 50)

function Summary({
  data,
  draft,
  m,
  onSet,
  build,
  building,
  buildStep,
  credits,
  donePlan,
}: {
  data: InterviewData
  draft: GoalAnswer
  m: (x: number) => string
  onSet: (p: Partial<Draft>) => void
  build: () => void
  building: boolean
  buildStep: number
  credits: string
  donePlan: string | null
}) {
  const { customer, customers } = data.vocabulary
  const r = realityCheck(data, draft)
  const target = planTarget(data, draft)
  const unit = draft.objective === 'LEADS' ? 'enquiries' : `new ${customers}`
  const one = draft.objective === 'LEADS' ? 'enquiry' : customer
  const by = r?.source === 'ads' ? 'your own ads' : 'what is typical in your industry'
  const short = r && (!r.reachable || r.capacityLimit !== null)

  return (
    <div className="chat-rise ml-10 overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-zinc-200/80">
      <div className={`${BRAND} px-4 py-3 text-white`}>
        <p className="text-xs font-semibold tracking-wide text-white/80">YOUR GOAL</p>
        <p className="mt-0.5 text-lg font-semibold">
          {target ? `${target} ${unit}` : OBJECTIVES.find((o) => o.id === draft.objective)?.label(customers)} in {draft.months} month{draft.months > 1 ? 's' : ''}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-zinc-100 text-sm">
        <div className="bg-white px-4 py-2.5">
          <dt className="text-xs text-zinc-500">Ad budget</dt>
          <dd className="font-medium">{draft.monthlyBudget ? `${m(draft.monthlyBudget)} / month` : 'Posts only'}</dd>
        </div>
        <div className="bg-white px-4 py-2.5">
          <dt className="text-xs text-zinc-500">Focus</dt>
          <dd className="truncate font-medium">{draft.focus?.length ? draft.focus.join(', ') : 'Everything'}</dd>
        </div>
      </dl>

      <div className="space-y-2 px-4 py-3 text-sm">
        {r && r.reachable && r.capacityLimit === null && (
          <InsightCard inset={false} insight={{ tone: 'good', text: `At about ${m(r.per)} per ${one} (${by}), this budget brings around ${r.expected} ${unit}. Your target fits.` }} />
        )}
        {r && !r.reachable && (
          <InsightCard
            inset={false}
            insight={{
              tone: 'warn',
              text: `At about ${m(r.per)} per ${one} (${by}), ${m(draft.monthlyBudget!)} a month brings around ${r.expected} ${unit}, not ${draft.target}. For ${draft.target} you’d need about ${m(r.neededMonthly)} a month.`,
            }}
          />
        )}
        {r && r.capacityLimit !== null && (
          <InsightCard inset={false} insight={{ tone: 'warn', text: `That is more than the ${r.capacityLimit} ${customers} you said you can take on in ${draft.months} month${draft.months > 1 ? 's' : ''}.` }} />
        )}
        {!r && draft.monthlyBudget && (draft.objective === 'SALES' || draft.objective === 'LEADS') && (
          <InsightCard inset={false} insight={{ tone: 'info', text: 'No cost history yet — the plan starts carefully and goals track the real cost from the first week.' }} />
        )}
        {r && short && !donePlan && (
          <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Which target">
            <button aria-pressed={!draft.stretch} onClick={() => onSet({ stretch: false })} className={!draft.stretch ? chipOn : chip}>
              Plan for a realistic {Math.max(1, Math.min(r.expected, r.capacityLimit ?? Infinity))}
            </button>
            <button aria-pressed={draft.stretch} onClick={() => onSet({ stretch: true })} className={draft.stretch ? chipOn : chip}>
              Keep {draft.target} and show what it takes
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-100 px-4 py-3">
        {donePlan ? (
          <Link href={`/app/strategy/${donePlan}`} className={`flex w-full items-center justify-center gap-2 rounded-xl ${BRAND} px-5 py-3 text-sm font-semibold text-white`}>
            Open your plan <ArrowRight size={16} />
          </Link>
        ) : building ? (
          <div className="flex items-center gap-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm" aria-live="polite">
            <Loader2 size={18} className="animate-spin text-[#7b3ff2]" />
            <span className="font-medium">{BUILDING[buildStep]}…</span>
            <span className="ml-auto text-xs text-zinc-500">about a minute</span>
          </div>
        ) : (
          <button onClick={build} className={`flex w-full items-center justify-center gap-2 rounded-xl ${BRAND} px-5 py-3 text-sm font-semibold text-white shadow-md shadow-fuchsia-500/20 transition hover:brightness-110`}>
            <Sparkles size={16} /> Build my plan · {credits}
          </button>
        )}
      </div>
    </div>
  )
}
