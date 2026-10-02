'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, Loader2, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Popover'
import { fileToJpeg } from '@/lib/client-image'
import { listMedia, uploadMedia } from '@/app/app/posts/actions'

export type PickedMedia = { id: string; url: string }

// Upload new images or pick from everything this workspace already has
// (AI images, Studio exports, earlier uploads).
export function MediaPicker({
  onClose,
  onPick,
  max = 10,
}: {
  onClose: () => void
  onPick: (items: PickedMedia[]) => void
  max?: number
}) {
  const [items, setItems] = useState<PickedMedia[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string>()
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listMedia().then(setItems)
  }, [])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setError(undefined)
    const added: PickedMedia[] = []
    for (const f of Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 10)) {
      // PNGs keep transparency (logos, cut-outs); everything else becomes JPEG.
      const { data } = await fileToJpeg(f, 2048, 0.9, f.type === 'image/png')
      const res = await uploadMedia({ data })
      if (res.error) setError(res.error)
      else if (res.id && res.url) added.push({ id: res.id, url: res.url })
    }
    setItems((cur) => [...added, ...(cur ?? [])])
    setSelected((s) => [...added.map((a) => a.id), ...s].slice(0, max))
    setUploading(false)
  }

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < max ? [...s, id] : s))

  return (
    <Modal title="Add images" onClose={onClose}>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          upload(e.target.files)
          e.target.value = ''
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          upload(e.dataTransfer.files)
        }}
        className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 py-6 text-sm text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
      >
        {uploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
        {uploading ? 'Uploading…' : 'Upload or drop images (PNG, JPG, WebP)'}
      </button>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <p className="mt-5 mb-2 text-sm font-medium">Your images</p>
      {items === null ? (
        <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-500">
          <ImagePlus size={16} /> Nothing yet — upload, generate in Create or export from Studio.
        </p>
      ) : (
        <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto">
          {items.map((m) => {
            const on = selected.includes(m.id)
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                aria-label={on ? 'Deselect image' : 'Select image'}
                aria-pressed={on}
                className={`relative aspect-square overflow-hidden rounded-lg ring-2 ${on ? 'ring-zinc-900' : 'ring-transparent'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                {on && (
                  <span className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-white">
                    <Check size={12} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
          Cancel
        </button>
        <button
          disabled={selected.length === 0}
          onClick={() => {
            onPick((items ?? []).filter((m) => selected.includes(m.id)))
            onClose()
          }}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          Add {selected.length > 0 ? selected.length : ''} image{selected.length === 1 ? '' : 's'}
        </button>
      </div>
    </Modal>
  )
}
