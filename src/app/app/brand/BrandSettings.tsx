'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { BrandEditor } from '@/components/BrandEditor'
import { PageHeader } from '@/components/EmptyState'
import type { BrandDraft } from '@/lib/brand-schema'
import { saveBrand } from './actions'

export function BrandSettings({ initial }: { initial: BrandDraft }) {
  const [brand, setBrand] = useState(initial)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const save = () => {
    setError(undefined)
    setSaved(false)
    start(async () => {
      const res = await saveBrand(brand)
      if (res.error) setError(res.error)
      else setSaved(true)
    })
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Brand settings" sub="Everything the AI creates follows these details." />
      <BrandEditor value={brand} onChange={(v) => (setBrand(v), setSaved(false))} extended />
      {error && <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="sticky bottom-0 mt-8 flex items-center gap-4 border-t border-zinc-100 bg-white py-4">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
            <Check size={15} /> Saved
          </span>
        )}
      </div>
    </div>
  )
}
