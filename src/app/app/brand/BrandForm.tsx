'use client'

import { useActionState, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { Field, FormError, Input, Textarea } from '@/components/ui/form'
import { saveBrand } from './actions'

const TONES = ['Friendly', 'Professional', 'Playful', 'Bold', 'Premium', 'Expert', 'Warm', 'Witty']

type Initial = {
  website: string
  description: string
  voice: string
  audience: string
  colors: string[]
  fonts: string
}

export function BrandForm({ initial }: { initial: Initial }) {
  const [state, action, pending] = useActionState(saveBrand, undefined)
  const [voice, setVoice] = useState(initial.voice)
  const [colors, setColors] = useState<string[]>(initial.colors.length ? initial.colors : ['#FF6000'])

  const toggleTone = (tone: string) => {
    const parts = voice
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const next = parts.includes(tone) ? parts.filter((p) => p !== tone) : [...parts, tone]
    setVoice(next.join(', '))
  }

  return (
    <form action={action} className="space-y-6">
      <Section title="About the brand">
        <Field label="Website" hint="We use it later to pull products, prices and tone automatically.">
          <Input name="website" type="url" placeholder="https://example.com" defaultValue={initial.website} />
        </Field>
        <Field label="What do you do?" hint="Two or three sentences: what you sell, to whom, what makes you different.">
          <Textarea
            name="description"
            rows={4}
            placeholder="Family bakery in Tbilisi. Sourdough, croissants and cakes to order. Everything baked the same morning."
            defaultValue={initial.description}
          />
        </Field>
        <Field label="Target audience">
          <Textarea
            name="audience"
            rows={3}
            placeholder="Women and men 25–45 in Tbilisi who order for the office or family weekends."
            defaultValue={initial.audience}
          />
        </Field>
      </Section>

      <Section title="Voice">
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => {
            const on = voice.split(',').map((p) => p.trim()).includes(t)
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTone(t)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  on ? 'border-white bg-white text-zinc-950' : 'border-white/10 text-zinc-300 hover:border-white/30'
                }`}
              >
                {t}
              </button>
            )
          })}
        </div>
        <Field label="Tone of voice" hint="Pick above or write your own — e.g. “short sentences, no emojis, always end with a question”.">
          <Input name="voice" value={voice} onChange={(e) => setVoice(e.target.value)} />
        </Field>
      </Section>

      <Section title="Look">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-zinc-200">Brand colours</span>
          <div className="flex flex-wrap items-center gap-3">
            {colors.map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950 py-1 pr-1 pl-1">
                <input
                  type="color"
                  name="colors"
                  value={c}
                  onChange={(e) => setColors(colors.map((x, j) => (j === i ? e.target.value : x)))}
                  className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent"
                  aria-label={`Colour ${i + 1}`}
                />
                <span className="font-mono text-xs text-zinc-400 uppercase">{c}</span>
                <button
                  type="button"
                  onClick={() => setColors(colors.filter((_, j) => j !== i))}
                  className="p-1 text-zinc-500 hover:text-white"
                  aria-label="Remove colour"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {colors.length < 6 && (
              <button
                type="button"
                onClick={() => setColors([...colors, '#7C3AED'])}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-zinc-400 hover:text-white"
              >
                <Plus size={14} /> Add colour
              </button>
            )}
          </div>
        </div>
        <Field label="Fonts" hint="Comma-separated, e.g. Inter, Playfair Display">
          <Input name="fonts" defaultValue={initial.fonts} />
        </Field>
      </Section>

      <FormError message={state?.error} />
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save brand kit'}
        </button>
        {state?.ok && !pending && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
            <Check size={15} /> Saved
          </span>
        )}
      </div>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}
