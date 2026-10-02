'use client'

import { useState } from 'react'
import { ImageOff, Link2, Plus, X } from 'lucide-react'
import type { BrandDraft } from '@/lib/brand-schema'
import { SocialIcon } from './social'

const TONES = ['Friendly', 'Professional', 'Playful', 'Bold', 'Premium', 'Expert', 'Warm', 'Witty']

const inputCls =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100'

// Controlled brand form used in onboarding ("Your brand is ready") and in
// Brand settings. `extended` adds voice, audience and fonts.
export function BrandEditor({
  value,
  onChange,
  extended = false,
}: {
  value: BrandDraft
  onChange: (v: BrandDraft) => void
  extended?: boolean
}) {
  const set = <K extends keyof BrandDraft>(k: K, v: BrandDraft[K]) => onChange({ ...value, [k]: v })
  const [logoBroken, setLogoBroken] = useState(false)

  return (
    <div className="space-y-7">
      <Block title="Name" required hint="The name customers know your business by.">
        <input aria-label="Brand name" className={inputCls} value={value.name} onChange={(e) => set('name', e.target.value)} />
      </Block>

      <Block title="Website" hint="Your primary brand website.">
        <div className="relative max-w-sm">
          <Link2 size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
          <input
            aria-label="Website"
            className={`${inputCls} pl-9`}
            placeholder="https://example.com"
            value={value.website}
            onChange={(e) => set('website', e.target.value)}
          />
        </div>
      </Block>

      <Block title="Description" hint="Give Khma useful context about what your brand does and who it serves.">
        <textarea
          aria-label="Description"
          className={`${inputCls} min-h-28 resize-y`}
          value={value.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </Block>

      <Block title="Logo" hint="Paste a link to a square PNG, JPG or WebP. Uploads are coming soon.">
        <div className="flex items-center gap-4">
          <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
            {value.logoUrl && !logoBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.logoUrl} alt="" className="h-full w-full object-contain p-2" onError={() => setLogoBroken(true)} />
            ) : (
              <ImageOff size={22} className="text-zinc-300" />
            )}
          </div>
          <input
            aria-label="Logo URL"
            className={inputCls}
            placeholder="https://example.com/logo.png"
            value={value.logoUrl}
            onChange={(e) => {
              setLogoBroken(false)
              set('logoUrl', e.target.value)
            }}
          />
        </div>
      </Block>

      <Block title="Color palette" hint="Add the colors Khma should use when creating for this brand.">
        <div className="flex flex-wrap items-center gap-3">
          {value.colors.map((c, i) => (
            <span key={i} className="group relative">
              <label
                className="block h-14 w-14 cursor-pointer rounded-full border border-black/10 shadow-sm"
                style={{ background: c }}
                title={c}
              >
                <input
                  type="color"
                  value={c}
                  onChange={(e) => set('colors', value.colors.map((x, j) => (j === i ? e.target.value : x)))}
                  className="sr-only"
                  aria-label={`Color ${i + 1}`}
                />
              </label>
              <button
                type="button"
                onClick={() => set('colors', value.colors.filter((_, j) => j !== i))}
                className="absolute -top-1 -right-1 hidden h-5 w-5 place-items-center rounded-full bg-white text-zinc-600 shadow ring-1 ring-zinc-200 group-hover:grid"
                aria-label="Remove color"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {value.colors.length < 8 && (
            <button
              type="button"
              onClick={() => set('colors', [...value.colors, '#7c3aed'])}
              className="grid h-14 w-14 place-items-center rounded-full border-2 border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-400"
              aria-label="Add color"
            >
              <Plus size={18} />
            </button>
          )}
        </div>
      </Block>

      <Block title="Social links" hint="Add the public social profiles associated with this brand.">
        <div className="space-y-2">
          {value.socialLinks.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-1 items-center overflow-hidden rounded-lg border border-zinc-200">
                <span className="grid h-10 w-11 shrink-0 place-items-center border-r border-zinc-200 bg-zinc-50">
                  <SocialIcon url={l} />
                </span>
                <input
                  aria-label="Social profile URL"
                  className="w-full px-3 py-2.5 text-sm outline-none"
                  value={l}
                  onChange={(e) => set('socialLinks', value.socialLinks.map((x, j) => (j === i ? e.target.value : x)))}
                />
              </div>
              <button
                type="button"
                onClick={() => set('socialLinks', value.socialLinks.filter((_, j) => j !== i))}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100"
                aria-label="Remove link"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          {value.socialLinks.length < 12 && (
            <button
              type="button"
              onClick={() => set('socialLinks', [...value.socialLinks, 'https://'])}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
            >
              <Plus size={15} /> Add social link
            </button>
          )}
        </div>
      </Block>

      {extended && (
        <>
          <Block title="Tone of voice" hint="Pick a few or describe it in your own words.">
            <div className="mb-3 flex flex-wrap gap-2">
              {TONES.map((t) => {
                const parts = (value.voice ?? '').split(',').map((p) => p.trim()).filter(Boolean)
                const on = parts.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('voice', (on ? parts.filter((p) => p !== t) : [...parts, t]).join(', '))}
                    className={`rounded-full border px-3 py-1 text-sm transition ${
                      on ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
                    }`}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
            <input aria-label="Tone of voice" className={inputCls} value={value.voice ?? ''} onChange={(e) => set('voice', e.target.value)} />
          </Block>
          <Block title="Target audience">
            <textarea
              aria-label="Target audience"
              className={`${inputCls} min-h-20 resize-y`}
              placeholder="Who buys from you? Age, city, interests, what they care about."
              value={value.audience ?? ''}
              onChange={(e) => set('audience', e.target.value)}
            />
          </Block>
          <Block title="Fonts" hint="Comma-separated, e.g. Inter, Playfair Display">
            <input aria-label="Fonts" className={inputCls} value={value.fonts ?? ''} onChange={(e) => set('fonts', e.target.value)} />
          </Block>
        </>
      )}
    </div>
  )
}

function Block({
  title,
  hint,
  required,
  children,
}: {
  title: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="text-[15px] font-semibold text-zinc-900">
        {title}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </h3>
      {hint && <p className="mt-0.5 mb-2.5 text-sm text-zinc-500">{hint}</p>}
      {!hint && <div className="mb-2.5" />}
      {children}
    </section>
  )
}
