'use client'

import { CTA_IDS, CTA_TYPES, type Cta, type CtaType } from '@/lib/cta'

// Call to action for a post or a whole campaign: the button text and where
// it leads (a link, or a phone for calls and WhatsApp).
export function CtaPicker({ value, onChange, defaultUrl }: { value: Cta | null; onChange: (c: Cta | null) => void; defaultUrl?: string | null }) {
  const needs = value ? CTA_TYPES[value.type].needs : 'none'
  const field = 'min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400'
  return (
    <div className="flex flex-wrap gap-2">
      <select
        aria-label="Call to action"
        value={value?.type ?? ''}
        onChange={(e) => {
          const type = e.target.value as CtaType | ''
          if (!type) return onChange(null)
          onChange({ type, url: value?.url ?? defaultUrl ?? null, phone: value?.phone ?? null })
        }}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
      >
        <option value="">No call to action</option>
        {CTA_IDS.map((t) => (
          <option key={t} value={t}>
            {CTA_TYPES[t].emoji} {CTA_TYPES[t].label}
          </option>
        ))}
      </select>
      {value && needs === 'url' && (
        <input
          type="url"
          aria-label="Call to action link"
          placeholder="https://your-site.com/page"
          value={value.url ?? ''}
          onChange={(e) => onChange({ ...value, url: e.target.value || null })}
          className={field}
        />
      )}
      {value && needs === 'phone' && (
        <input
          type="tel"
          aria-label="Call to action phone"
          placeholder="+995 555 12 34 56"
          value={value.phone ?? ''}
          onChange={(e) => onChange({ ...value, phone: e.target.value || null })}
          className={field}
        />
      )}
    </div>
  )
}
