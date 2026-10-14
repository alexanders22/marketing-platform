'use client'

import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { CopyStyleDialog } from '@/components/CopyStyleDialog'
import { IMAGE_STYLE_IDS, IMAGE_STYLES } from '@/lib/image-styles'
import type { StyleView } from '@/lib/style-ref'
import { myStyles } from '@/app/app/studio/styles/actions'

// Style chips for AI images (realistic photo, illustration, 3D…), then the
// styles copied from references ("ref:<id>"), and "Copy a style…".
export function ImageStylePicker({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const [mine, setMine] = useState<StyleView[]>([])
  const [copying, setCopying] = useState(false)
  useEffect(() => {
    myStyles().then(setMine, () => setMine([]))
  }, [])
  const chip = (on: boolean) => `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 ${on ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50'}`
  return (
    <div role="radiogroup" aria-label="Image style" className="flex flex-wrap gap-1.5">
      {IMAGE_STYLE_IDS.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(s)} className={chip(value === s)}>
          {IMAGE_STYLES[s].label}
        </button>
      ))}
      {mine.map((m) => {
        const id = `ref:${m.id}`
        return (
          <button key={m.id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)} title={m.summary} className={`${chip(value === id)} py-1 pl-1`}>
            {m.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.thumbUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <span className="h-6 w-6 rounded-full" style={{ background: m.palette[0] ?? '#a1a1aa' }} />
            )}
            {m.name}
          </button>
        )
      })}
      <button type="button" onClick={() => setCopying(true)} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#7b3ff2]/50 px-3 py-1.5 text-sm font-medium text-[#6a32d8] hover:bg-violet-50">
        <Copy size={13} /> Copy a style…
      </button>
      {copying && (
        <CopyStyleDialog
          kind="IMAGE"
          onClose={() => setCopying(false)}
          onDone={(s) => {
            setMine((cur) => [s, ...cur.filter((x) => x.id !== s.id)])
            onChange(`ref:${s.id}`)
            setCopying(false)
          }}
        />
      )}
    </div>
  )
}
