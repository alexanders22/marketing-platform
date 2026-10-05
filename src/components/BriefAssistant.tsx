'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Check, Compass, Lightbulb, Loader2, MapPin, RotateCcw, Sparkles, Users } from 'lucide-react'
import type { BriefAdvice } from '@/lib/ai'
import { getAdvice, saveAnswers, translateAdvice } from '@/app/app/brief/actions'
import { creditsLabel } from '@/lib/pricing'
import { usePrices } from '@/components/Prices'

export type Idea = BriefAdvice['ideas'][number]
export type Audience = BriefAdvice['audiences'][number]

// Before writing: Loudpilot looks at the dossier, the owner's answers and the
// last 30 days, proposes audiences (location + product), asks what it still
// needs to know, and offers ideas. Answers are kept for next time.
export function BriefAssistant({
  kind,
  language,
  onUse,
  defaultOpen = true,
}: {
  kind: 'post' | 'campaign'
  language?: string
  onUse: (idea: Idea, audience: Audience | null) => void
  defaultOpen?: boolean
}) {
  const P = usePrices()
  // The composer owns the language; elsewhere the assistant has its own.
  const [ownLang, setOwnLang] = useState('English')
  const lang = language ?? ownLang
  const [adviceLang, setAdviceLang] = useState<string>()
  const [translating, startTranslate] = useTransition()
  const [open, setOpen] = useState(defaultOpen)
  const [goal, setGoal] = useState('')
  const [advice, setAdvice] = useState<BriefAdvice>()
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [audience, setAudience] = useState<number | null>(null)
  const [used, setUsed] = useState<number | null>(null)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const ask = () =>
    start(async () => {
      setError(undefined)
      setSaved(false)
      const res = await getAdvice({ kind, goal, language: lang })
      if (res.error || !res.advice) return setError(res.error)
      setAdvice(res.advice)
      setAdviceLang(lang)
      setAnswers({})
      setAudience(res.advice.audiences.length ? 0 : null)
      setUsed(null)
    })

  // Switching language keeps the suggestions and answers — just translated.
  const translateTo = useCallback(
    (to: string) => {
      if (!advice || to === adviceLang) return
      startTranslate(async () => {
        setError(undefined)
        const res = await translateAdvice(advice, to)
        if (res.error || !res.advice) return setError(res.error)
        setAdvice(res.advice)
        setAdviceLang(to)
      })
    },
    [advice, adviceLang],
  )
  const lastLang = useRef(lang)
  useEffect(() => {
    if (lastLang.current === lang) return
    lastLang.current = lang
    translateTo(lang)
  }, [lang, translateTo])

  const answered = advice ? advice.questions.flatMap((q, i) => (answers[i]?.trim() ? [{ question: q.question, answer: answers[i].trim() }] : [])) : []

  const saveAndRefine = (again: boolean) =>
    start(async () => {
      setError(undefined)
      await saveAnswers(answered)
      setSaved(true)
      if (!again) return
      const res = await getAdvice({ kind, goal, language: lang })
      if (res.error || !res.advice) return setError(res.error)
      setAdvice(res.advice)
      setAdviceLang(lang)
      setAnswers({})
      setAudience(res.advice.audiences.length ? 0 : null)
      setUsed(null)
    })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-3 text-left text-sm hover:bg-indigo-50"
      >
        <Compass size={18} className="text-indigo-600" />
        <span>
          <b className="font-semibold">Not sure what to {kind === 'campaign' ? 'run' : 'post'}?</b> Loudpilot suggests audiences and ideas from your data.
        </span>
      </button>
    )
  }

  return (
    <section aria-label="Loudpilot suggestions" className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-violet-50/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-indigo-600 ring-1 ring-indigo-200">
          <Compass size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Let Loudpilot suggest {kind === 'campaign' ? 'a campaign' : 'what to post'}</h2>
          <p className="text-sm text-zinc-600">Who to reach — by location and product — what it still needs to know, and ideas from your results.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {language === undefined && (
            <select
              value={ownLang}
              onChange={(e) => setOwnLang(e.target.value)}
              aria-label="Suggestions language"
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs"
            >
              {['English', 'Georgian', 'Russian'].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          )}
          {advice && (
            <button type="button" onClick={() => setAdvice(undefined)} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900">
              <RotateCcw size={12} /> Start over
            </button>
          )}
        </div>
      </div>

      {!advice && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), ask())}
            placeholder="What do you want? e.g. more bookings in October — or leave empty"
            aria-label="What do you want to achieve"
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
          <button
            type="button"
            onClick={ask}
            disabled={pending}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {pending ? 'Thinking…' : `Suggest · ${creditsLabel(P.advice)}`}
          </button>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {translating && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-indigo-700" role="status">
          <Loader2 size={14} className="animate-spin" /> Translating to {lang}…
        </p>
      )}
      {advice && (
        <div className={`mt-4 space-y-5 ${pending || translating ? 'opacity-60' : ''}`}>
          {advice.known.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-zinc-500">WHAT I KNOW</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {advice.known.map((k) => (
                  <li key={k} className="rounded-full bg-white px-2.5 py-1 text-xs text-zinc-700 ring-1 ring-zinc-200">
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {advice.questions.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-zinc-500">A FEW QUESTIONS — ANSWER WHAT YOU CAN</p>
              <ul className="mt-2 space-y-3">
                {advice.questions.map((q, i) => (
                  <li key={q.question} className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
                    <p className="text-sm font-medium">{q.question}</p>
                    {q.why && <p className="text-xs text-zinc-500">{q.why}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {q.options.map((o) => (
                        <button
                          type="button"
                          key={o}
                          onClick={() => setAnswers((a) => ({ ...a, [i]: o }))}
                          className={`rounded-full px-2.5 py-1 text-xs ring-1 ${answers[i] === o ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-zinc-50 text-zinc-700 ring-zinc-200 hover:bg-zinc-100'}`}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                    <input
                      value={answers[i] ?? ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                      placeholder="Or write your answer"
                      aria-label={`Answer: ${q.question}`}
                      className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => saveAndRefine(true)}
                  disabled={pending || answered.length === 0}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
                >
                  Save answers & suggest again · {creditsLabel(P.advice)}
                </button>
                <button
                  type="button"
                  onClick={() => saveAndRefine(false)}
                  disabled={pending || answered.length === 0}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-white disabled:opacity-40"
                >
                  Just save
                </button>
                {saved && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <Check size={13} /> Saved to the dossier — Loudpilot won&apos;t ask again
                  </span>
                )}
              </div>
            </div>
          )}

          {advice.audiences.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-zinc-500">WHO TO REACH</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {advice.audiences.map((a, i) => (
                  <button
                    type="button"
                    key={a.name}
                    onClick={() => setAudience(i)}
                    aria-pressed={audience === i}
                    className={`rounded-xl p-3 text-left text-sm ring-1 transition ${audience === i ? 'bg-white ring-2 ring-indigo-500' : 'bg-white/70 ring-zinc-200 hover:bg-white'}`}
                  >
                    <p className="flex items-center gap-1.5 font-semibold">
                      <Users size={14} className="text-indigo-600" /> {a.name}
                    </p>
                    {a.where && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                        <MapPin size={12} /> {a.where}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-zinc-700">{a.who}</p>
                    {a.wants && <p className="mt-1 text-xs text-zinc-500">Wants: {a.wants}</p>}
                    {a.how && <p className="mt-1 text-xs text-zinc-500">How: {a.how}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {advice.ideas.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-zinc-500">IDEAS</p>
              <ul className="mt-2 space-y-2">
                {advice.ideas.map((idea, i) => (
                  <li key={idea.title} className="flex flex-col gap-3 rounded-xl bg-white p-3 ring-1 ring-zinc-200 sm:flex-row sm:items-start">
                    <Lightbulb size={16} className="mt-0.5 hidden shrink-0 text-amber-500 sm:block" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{idea.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {[idea.format, idea.network === 'BOTH' ? 'Facebook + Instagram' : idea.network === 'FACEBOOK' ? 'Facebook' : 'Instagram', idea.audience]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <p className="mt-1 text-sm text-zinc-700">{idea.why}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUsed(i)
                        const byName = advice.audiences.find((a) => a.name === idea.audience)
                        onUse(idea, byName ?? (audience !== null ? advice.audiences[audience] : null))
                      }}
                      className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
                    >
                      {used === i ? 'Used ✓' : 'Use this idea'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// One line the copywriter (AI or human) can use.
export const audienceLine = (a: Audience | null) => (a ? `Audience: ${a.name} — ${a.who}${a.where ? ` (${a.where})` : ''}. They want: ${a.wants}` : '')
