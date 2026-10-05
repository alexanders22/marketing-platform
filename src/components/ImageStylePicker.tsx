'use client'

import { IMAGE_STYLE_IDS, IMAGE_STYLES, type ImageStyle } from '@/lib/image-styles'

// Style chips for AI images (realistic photo, illustration, 3D…).
export function ImageStylePicker({ value, onChange }: { value: ImageStyle; onChange: (s: ImageStyle) => void }) {
  return (
    <div role="radiogroup" aria-label="Image style" className="flex flex-wrap gap-1.5">
      {IMAGE_STYLE_IDS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={`rounded-full px-3 py-1.5 text-sm ring-1 ${value === s ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50'}`}
        >
          {IMAGE_STYLES[s].label}
        </button>
      ))}
    </div>
  )
}
