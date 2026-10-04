'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, Check, Link2, Loader2, Palette, Store } from 'lucide-react'
import { BrandEditor } from '@/components/BrandEditor'
import { PlanPicker } from '@/components/PlanPicker'
import type { BrandDraft } from '@/lib/brand-schema'
import Link from 'next/link'
import { addCompany } from '../app/companies/actions'
import { analyzeWebsite, completeOnboarding } from './actions'

type Step = 'source' | 'analyzing' | 'review' | 'plan'

const EMPTY: BrandDraft = { name: '', website: '', description: '', logoUrl: '', colors: [], socialLinks: [] }
const CHECKS = ['Scanning your website', 'Extracting logos and colors', 'Finding social profiles', 'Preparing your brand']

// `company`: one more company for an existing account (no plan step).
export function Onboarding({ mode: flow = 'first' }: { mode?: 'first' | 'company' }) {
  const [step, setStep] = useState<Step>('source')
  const [mode, setMode] = useState<'website' | 'manual'>('website')
  const [url, setUrl] = useState('')
  const [brand, setBrand] = useState<BrandDraft>(EMPTY)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(0)
  const [saving, startSave] = useTransition()

  // Tick the checklist while the import runs; the last item waits for the result.
  useEffect(() => {
    if (step !== 'analyzing') return
    const t = setInterval(() => setDone((d) => Math.min(d + 1, CHECKS.length - 1)), 900)
    return () => clearInterval(t)
  }, [step])

  const start = async () => {
    setError(undefined)
    if (mode === 'manual') {
      setBrand(EMPTY)
      setStep('review')
      return
    }
    if (!url.trim()) return setError('Enter your website address')
    setDone(0)
    setStep('analyzing')
    const res = await analyzeWebsite(url)
    if (res.error || !res.brand) {
      setError(res.error)
      setStep('source')
      return
    }
    const b = res.brand
    setDone(CHECKS.length)
    await new Promise((r) => setTimeout(r, 500))
    setBrand({
      name: b.name,
      website: b.website,
      description: b.description,
      logoUrl: b.logoUrl ?? '',
      colors: b.colors,
      socialLinks: b.socialLinks,
    })
    setStep('review')
  }

  const save = () => {
    setError(undefined)
    startSave(async () => {
      const draft = { ...brand, socialLinks: brand.socialLinks.filter((l) => l.trim() && l.trim() !== 'https://') }
      // addCompany redirects into the new company when it succeeds.
      const res = flow === 'company' ? await addCompany(draft) : await completeOnboarding(draft)
      if (res?.error) return setError(res.error)
      setStep('plan')
    })
  }

  const progress = { source: 1, analyzing: 2, review: 2, plan: 3 }[step]
  const steps = flow === 'company' ? 2 : 3

  return (
    <div className="min-h-screen bg-[#f4f3f1] px-4 py-10 text-zinc-900 sm:py-16">
      {step === 'plan' ? (
        <div className="mx-auto max-w-6xl">
          <PlanPicker after="/app" />
        </div>
      ) : (
        <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-10">
          {flow === 'company' && step === 'source' && (
            <Link href="/app" className="mb-2 inline-flex rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100" aria-label="Back to the app">
              <ArrowLeft size={20} />
            </Link>
          )}
          {step !== 'source' && (
            <button
              onClick={() => setStep('source')}
              className="mb-2 rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
          )}

          {step === 'source' && (
            <>
              <Header icon={Store} tint="bg-sky-50 text-sky-600" title={flow === 'company' ? 'Add a company' : "Let's understand your brand"}>
                Import your website and Loudpilot will build your brand — or enter the essentials manually.
              </Header>
              <div className="mx-auto mt-8 max-w-xl">
                <div className="grid grid-cols-2 rounded-lg bg-zinc-100 p-1 text-sm">
                  {(['website', 'manual'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-md py-2 font-semibold transition ${
                        mode === m ? 'bg-white shadow-sm' : 'text-zinc-500'
                      }`}
                    >
                      {m === 'website' ? 'Use my website' : 'Set up manually'}
                    </button>
                  ))}
                </div>
                {mode === 'website' ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      start()
                    }}
                    className="mt-6"
                  >
                    <label className="text-sm font-semibold" htmlFor="site">
                      Website URL
                    </label>
                    <div className="relative mt-2">
                      <Link2 size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
                      <input
                        id="site"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="www.yourcompany.com"
                        className="w-full rounded-lg border border-zinc-200 py-2.5 pr-3 pl-9 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
                      />
                    </div>
                  </form>
                ) : (
                  <p className="mt-6 text-sm text-zinc-500">
                    You&apos;ll fill in your brand name, description, colors and social links on the next step.
                  </p>
                )}
                {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <div className="mt-8 flex justify-end">
                  <button
                    onClick={start}
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 'analyzing' && (
            <>
              <Header icon={Palette} tint="bg-violet-50 text-violet-600" title="Analyzing your brand…">
                Loudpilot is gathering the brand details it can find on your website.
              </Header>
              <ul className="mx-auto mt-8 max-w-md space-y-3">
                {CHECKS.map((c, i) => (
                  <li key={c} className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3.5">
                    {i < done ? (
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                        <Check size={15} />
                      </span>
                    ) : (
                      <Loader2 size={20} className="mx-1 animate-spin text-zinc-400" />
                    )}
                    <span className="font-medium">{c}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {step === 'review' && (
            <>
              <Header icon={Check} tint="bg-emerald-50 text-emerald-600" title={mode === 'manual' ? 'Describe your brand' : 'Your brand is ready'}>
                {mode === 'manual' ? 'Fill in the essentials — you can change them anytime.' : 'Review every part of your brand before continuing.'}
              </Header>
              <div className="mx-auto mt-8 max-w-xl">
                <BrandEditor value={brand} onChange={setBrand} />
                {error && <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <div className="mt-8 flex justify-end">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Continue'} <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mx-auto mt-8 flex max-w-md items-center gap-4">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(progress / steps) * 100}%` }} />
        </div>
        <span className="text-sm text-zinc-500">
          {progress} / {steps}
        </span>
      </div>
    </div>
  )
}

function Header({
  icon: Icon,
  tint,
  title,
  children,
}: {
  icon: typeof Store
  tint: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="text-center">
      <span className={`mx-auto grid h-14 w-14 place-items-center rounded-xl ${tint}`}>
        <Icon size={24} />
      </span>
      <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-zinc-500">{children}</p>
    </div>
  )
}
