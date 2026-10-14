'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Copy, Film, ImageIcon, Loader2, PencilRuler, Sparkles, X } from 'lucide-react'
import { CopyStyleDialog } from '@/components/CopyStyleDialog'
import { usePrices } from '@/components/Prices'
import { confirmDialog } from '@/components/ui/Dialog'
import { creditsLabel } from '@/lib/pricing'
import type { StyleView } from '@/lib/style-ref'
import { designFromMedia } from './actions'
import { deleteStyle, imagesInStyle, myStyles } from './styles/actions'

const ASPECTS = [
  { id: '1:1', label: 'Square', ratio: 1 },
  { id: '4:5', label: 'Portrait', ratio: 4 / 5 },
  { id: '9:16', label: 'Story', ratio: 9 / 16 },
  { id: '16:9', label: 'Wide', ratio: 16 / 9 },
] as const

// "Pictures like this": looks copied from pictures or videos the owner liked,
// and new images for the brand in one of them.
export function StyledImages({ brandName }: { brandName: string }) {
  const P = usePrices()
  const router = useRouter()
  const [styles, setStyles] = useState<StyleView[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [copying, setCopying] = useState<'IMAGE' | 'VIDEO' | null>(null)
  const [brief, setBrief] = useState('')
  const [count, setCount] = useState(2)
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]['id']>('1:1')
  const [made, setMade] = useState<{ id: string; url: string }[]>([])
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  const [opening, setOpening] = useState<string | null>(null)

  useEffect(() => {
    myStyles().then(setStyles, () => setStyles([]))
  }, [])
  const style = styles?.find((s) => s.id === sel) ?? null

  const generate = () => {
    if (brief.trim().length < 3) return setError('Describe the picture')
    setError(undefined)
    start(async () => {
      const res = await imagesInStyle({ styleId: `ref:${sel}`, brief, count, aspect })
      if (res.error || !res.images) return setError(res.error)
      setMade((m) => [...res.images!, ...m])
    })
  }

  const edit = (id: string) => {
    setOpening(id)
    start(async () => {
      const res = await designFromMedia(id, ASPECTS.find((a) => a.id === aspect)!.ratio)
      if ('id' in res && res.id) router.push(`/app/studio/${res.id}`)
      else setOpening(null)
    })
  }

  return (
    <section aria-labelledby="styled-heading" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="styled-heading" className="inline-flex items-center gap-2 text-lg font-semibold">
            <Copy size={18} className="text-[#7b3ff2]" /> Pictures like this
          </h2>
          <p className="text-sm text-zinc-500">Copy the look of any picture or video you like — new images for {brandName} in the same style.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCopying('IMAGE')} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-[#6a32d8] ring-1 ring-[#7b3ff2]/40 hover:bg-violet-50">
            <ImageIcon size={15} /> Copy from a picture
          </button>
          <button onClick={() => setCopying('VIDEO')} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-[#6a32d8] ring-1 ring-[#7b3ff2]/40 hover:bg-violet-50">
            <Film size={15} /> Copy from a video
          </button>
        </div>
      </div>

      {styles === null ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 size={15} className="animate-spin" /> Loading your styles…
        </p>
      ) : styles.length === 0 ? (
        <button
          onClick={() => setCopying('IMAGE')}
          className="mt-4 flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-[#7b3ff2]/40 bg-[linear-gradient(120deg,#faf5ff,#fff1f2_55%,#fff7ed)] px-6 py-8 text-center hover:border-[#7b3ff2]/70"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#7b3ff2] via-[#ff2e6e] to-[#ff5b14] text-white">
            <Sparkles size={20} />
          </span>
          <span className="font-semibold">Saw a post you love? Make yours look like it.</span>
          <span className="max-w-md text-sm text-zinc-500">Paste a link or upload a picture or video — Loudpilot copies the light, colours and composition and keeps the style for every new image.</span>
        </button>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" aria-label="Your styles" role="radiogroup">
          {styles.map((s) => (
            <li key={s.id} className="group relative">
              <button role="radio" aria-checked={sel === s.id} onClick={() => setSel(sel === s.id ? null : s.id)} className="block w-full text-left">
                <span className={`relative block aspect-square overflow-hidden rounded-xl ring-2 transition ${sel === s.id ? 'ring-[#7b3ff2]' : 'ring-transparent group-hover:ring-zinc-300'}`}>
                  {s.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="block h-full w-full" style={{ background: `linear-gradient(135deg, ${s.palette.join(', ') || '#a1a1aa, #e4e4e7'})` }} />
                  )}
                  <span className="absolute inset-x-0 bottom-0 flex gap-0.5 p-1.5">
                    {s.palette.slice(0, 5).map((c) => (
                      <span key={c} className="h-3 flex-1 rounded-sm ring-1 ring-white/60" style={{ background: c }} />
                    ))}
                  </span>
                  {s.kind === 'VIDEO' && (
                    <span className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      <Film size={10} className="-mt-0.5 mr-0.5 inline" /> video
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block truncate text-sm font-medium">{s.name}</span>
                <span className="line-clamp-2 block text-xs text-zinc-500">{s.summary}</span>
              </button>
              <button
                onClick={async () => {
                  if (!(await confirmDialog(`Delete the style “${s.name}”?`, { confirm: 'Delete', danger: true }))) return
                  await deleteStyle(s.id)
                  setStyles((cur) => cur?.filter((x) => x.id !== s.id) ?? null)
                  if (sel === s.id) setSel(null)
                }}
                aria-label={`Delete style ${s.name}`}
                className="absolute top-1.5 right-1.5 hidden rounded-md bg-white/90 p-1 text-zinc-700 group-hover:block hover:text-red-600"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {style && (
        <div className="mt-4 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-100">
          <p className="text-sm font-semibold">New images in “{style.name}”</p>
          <textarea
            value={brief}
            onChange={(e) => (setBrief(e.target.value), setError(undefined))}
            rows={2}
            aria-label="What should the picture show"
            placeholder="What should it show? e.g. our croissants on a marble counter, morning light"
            className="mt-2 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Image size" className="flex gap-1">
              {ASPECTS.map((a) => (
                <button key={a.id} role="radio" aria-checked={aspect === a.id} onClick={() => setAspect(a.id)} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ${aspect === a.id ? 'bg-zinc-900 text-white ring-zinc-900' : 'bg-white ring-zinc-200'}`}>
                  {a.label} {a.id}
                </button>
              ))}
            </div>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many" className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs">
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} image{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={generate}
              disabled={pending}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#7b3ff2] via-[#ff2e6e] to-[#ff5b14] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              {pending && !opening ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Make {count} · {creditsLabel(count * P.image)}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      )}

      {made.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="New images">
          {made.map((m) => (
            <li key={m.id} className="group relative overflow-hidden rounded-xl ring-1 ring-zinc-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt="" className="aspect-square w-full object-cover" />
              <button
                onClick={() => edit(m.id)}
                className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-zinc-800 shadow hover:bg-white"
              >
                {opening === m.id ? <Loader2 size={13} className="animate-spin" /> : <PencilRuler size={13} />} Edit in Studio
              </button>
            </li>
          ))}
        </ul>
      )}

      {copying && (
        <CopyStyleDialog
          kind={copying}
          onClose={() => setCopying(null)}
          onDone={(s) => {
            setStyles((cur) => [s, ...(cur ?? []).filter((x) => x.id !== s.id)])
            setSel(s.id)
            setCopying(null)
          }}
        />
      )}
    </section>
  )
}
