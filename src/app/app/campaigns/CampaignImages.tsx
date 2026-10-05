'use client'

import { useState } from 'react'
import { Check, ImageIcon, ImageOff, Loader2, Sparkles } from 'lucide-react'
import { Modal } from '@/components/ui/Popover'
import { usePrices } from '@/components/Prices'
import { TEMPLATE_PHOTO, TEMPLATE_PHOTO_LIBRARY, templatePhotoUrl } from '@/lib/design'
import { ImageStylePicker } from '@/components/ImageStylePicker'
import type { ImageStyle } from '@/lib/image-styles'
import { VideoMediaPicker } from '../studio/video/VideoMediaPicker'

export type ImagesChoice = null | { mode: 'ai'; prompt: string | null; style: ImageStyle } | { mode: 'photos'; photoIds: string[] }

type Picked = { id: string; url: string }

// "Pictures for your posts": AI images (from each post's text or one
// description, in a chosen style), photos from the templates or the
// library spread over the posts, or none.
export function CampaignImagesModal({
  posts,
  confirm,
  busy,
  error,
  onConfirm,
  onClose,
  allowNone = true,
}: {
  posts: number
  confirm: string
  busy: boolean
  error?: string
  onConfirm: (choice: ImagesChoice) => void
  onClose: () => void
  allowNone?: boolean
}) {
  const P = usePrices()
  const [mode, setMode] = useState<'ai' | 'photos' | 'none'>('ai')
  const [source, setSource] = useState<'post' | 'custom'>('post')
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState<ImageStyle>('realistic')
  const [picked, setPicked] = useState<Picked[]>([])
  const [library, setLibrary] = useState(false)

  const toggle = (p: Picked) => setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : [...cur, p].slice(0, 30)))
  const choice = (): ImagesChoice =>
    mode === 'none' ? null : mode === 'ai' ? { mode: 'ai', prompt: source === 'custom' ? prompt.trim() : null, style } : { mode: 'photos', photoIds: picked.map((p) => p.id) }
  const ready = mode === 'none' || (mode === 'ai' && (source === 'post' || prompt.trim().length >= 3)) || (mode === 'photos' && picked.length > 0)

  return (
    <Modal title="Pictures for your posts" onClose={onClose}>
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Pictures" className="grid grid-cols-3 gap-2">
          {(
            [
              ['ai', Sparkles, 'AI-generated'],
              ['photos', ImageIcon, 'Choose photos'],
              ...(allowNone ? ([['none', ImageOff, 'No pictures']] as const) : []),
            ] as const
          ).map(([m, Icon, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`flex flex-col items-center gap-1 rounded-xl p-3 text-sm font-medium ring-1 ${mode === m ? 'bg-zinc-900 text-white ring-zinc-900' : 'ring-zinc-200 hover:bg-zinc-50'}`}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </div>

        {mode === 'ai' && (
          <div className="space-y-3">
            <div role="radiogroup" aria-label="What to draw" className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={source === 'post'} onChange={() => setSource('post')} /> From each post&apos;s text — a different picture per post
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={source === 'custom'} onChange={() => setSource('custom')} /> My own description
              </label>
              {source === 'custom' && (
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Bright modern apartment interiors with city views, warm evening light"
                  aria-label="Image description"
                  className="min-h-20 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">Style</p>
              <div className="mt-1.5">
                <ImageStylePicker value={style} onChange={setStyle} />
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              {posts} picture{posts === 1 ? '' : 's'} · {posts * P.image} credits, charged per picture made. They appear on the posts within a few minutes.
            </p>
          </div>
        )}

        {mode === 'photos' && (
          <div className="space-y-3">
            {TEMPLATE_PHOTO_LIBRARY.map((g) => (
              <div key={g.category}>
                <p className="text-sm font-medium">Templates · {g.category}</p>
                <div className="mt-1.5 grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {g.refs.map((ref) => {
                    const id = `${TEMPLATE_PHOTO}${ref}`
                    const on = picked.findIndex((p) => p.id === id)
                    return (
                      <button
                        key={ref}
                        type="button"
                        onClick={() => toggle({ id, url: templatePhotoUrl(ref) })}
                        aria-label={`${on >= 0 ? 'Remove' : 'Add'} template photo ${ref.split('/')[1]}`}
                        aria-pressed={on >= 0}
                        className={`relative aspect-square overflow-hidden rounded-lg ring-2 ${on >= 0 ? 'ring-indigo-500' : 'ring-transparent'}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={templatePhotoUrl(ref)} alt="" className="h-full w-full object-cover" />
                        {on >= 0 && <span className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">{on + 1}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setLibrary(true)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50">
                From my library
              </button>
              {picked
                .filter((p) => !p.id.startsWith(TEMPLATE_PHOTO))
                .map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={p.url} alt="" className="h-10 w-10 rounded-lg object-cover ring-1 ring-zinc-200" />
                ))}
            </div>
            <p className="text-xs text-zinc-500">
              {picked.length ? `${picked.length} selected · ` : ''}Used in order, one per post{posts > picked.length && picked.length ? ', then repeated' : ''}.
            </p>
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
            Back
          </button>
          <button
            type="button"
            onClick={() => onConfirm(choice())}
            disabled={busy || !ready}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {confirm}
          </button>
        </div>
      </div>
      {library && (
        <VideoMediaPicker
          kind="visual"
          multiple
          onClose={() => setLibrary(false)}
          onPick={(items) =>
            setPicked((cur) => [...cur, ...items.filter((m) => m.kind === 'image' && !cur.some((p) => p.id === m.id)).map((m) => ({ id: m.id, url: m.url }))].slice(0, 30))
          }
        />
      )}
    </Modal>
  )
}
