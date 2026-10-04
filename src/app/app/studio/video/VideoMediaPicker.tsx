'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Film, Loader2, Music, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Popover'
import { fileToJpeg } from '@/lib/client-image'
import { uploadMedia } from '@/app/app/posts/actions'
import { listVideoMedia } from './actions'

export type LibraryItem = { id: string; kind: 'image' | 'video' | 'audio'; url: string; posterUrl: string | null; durationMs: number | null; name: string }

// Images go through the image upload (downscaled JPEG/PNG); videos and audio
// stream to /api/media/upload.
export async function uploadAny(file: File): Promise<LibraryItem> {
  if (file.type.startsWith('image/')) {
    const { data } = await fileToJpeg(file, 2048, 0.9, file.type === 'image/png')
    const res = await uploadMedia({ data, prompt: file.name })
    if (res.error || !res.id) throw new Error(res.error ?? 'Upload failed')
    return { id: res.id, kind: 'image', url: res.url!, posterUrl: null, durationMs: null, name: file.name }
  }
  const res = await fetch(`/api/media/upload?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  })
  const data = (await res.json().catch(() => ({}))) as { id?: string; url?: string; kind?: string; posterUrl?: string | null; durationMs?: number | null; error?: string }
  if (!res.ok || !data.id) throw new Error(data.error ?? 'Upload failed')
  return { id: data.id, kind: data.kind === 'AUDIO' ? 'audio' : 'video', url: data.url!, posterUrl: data.posterUrl ?? null, durationMs: data.durationMs ?? null, name: file.name }
}

const uniq = (list: LibraryItem[]) => list.filter((m, i) => list.findIndex((x) => x.id === m.id) === i)

const secs = (ms: number | null) => (ms ? `${Math.round(ms / 100) / 10}s` : '')

export function VideoMediaPicker({
  kind,
  onPick,
  onClose,
  multiple = false,
}: {
  kind: 'visual' | 'audio'
  onPick: (items: LibraryItem[]) => void
  onClose: () => void
  multiple?: boolean
}) {
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const file = useRef<HTMLInputElement>(null)

  // Uploads can finish before the library loads: merge, never duplicate.
  useEffect(() => {
    listVideoMedia(kind).then((list) => setItems((cur) => uniq([...(cur ?? []), ...list])))
  }, [kind])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError(undefined)
    const added: LibraryItem[] = []
    for (const f of Array.from(files).slice(0, 10)) {
      try {
        added.push(await uploadAny(f))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed')
      }
    }
    setItems((cur) => uniq([...added, ...(cur ?? [])]))
    setSelected((s) => (multiple ? [...s, ...added.map((a) => a.id)] : added.slice(-1).map((a) => a.id)))
    setBusy(false)
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : multiple ? [...s, id] : [id]))

  return (
    <Modal title={kind === 'audio' ? 'Music' : multiple ? 'Photos and clips' : 'Photo or clip'} onClose={onClose}>
      <input
        ref={file}
        type="file"
        hidden
        multiple={multiple}
        accept={kind === 'audio' ? 'audio/mpeg,audio/mp4,audio/wav,audio/ogg,.mp3,.m4a,.wav,.ogg' : 'image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm'}
        onChange={(e) => {
          upload(e.target.files)
          e.target.value = ''
        }}
      />
      <button
        onClick={() => file.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          upload(e.dataTransfer.files)
        }}
        className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 py-6 text-sm text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
      >
        {busy ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
        {busy ? 'Uploading…' : kind === 'audio' ? 'Upload music (MP3, M4A, WAV)' : 'Upload photos or video clips (up to 200 MB, 3 min)'}
      </button>
      {kind === 'audio' && <p className="mt-2 text-xs text-zinc-500">Use music you have the rights to — Instagram and Facebook mute tracks they recognise as copyrighted.</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <p className="mt-5 mb-2 text-sm font-medium">Library</p>
      {items === null ? (
        <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">Nothing yet — upload above.</p>
      ) : kind === 'audio' ? (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {items.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => toggle(m.id)}
                aria-pressed={selected.includes(m.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ring-1 ${selected.includes(m.id) ? 'bg-zinc-900 text-white ring-zinc-900' : 'ring-zinc-200 hover:bg-zinc-50'}`}
              >
                <Music size={15} /> <span className="min-w-0 flex-1 truncate">{m.name || 'Audio'}</span> <span className="text-xs opacity-70">{secs(m.durationMs)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto">
          {items.map((m) => {
            const on = selected.includes(m.id)
            const n = selected.indexOf(m.id)
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                aria-label={`${on ? 'Deselect' : 'Select'} ${m.kind}`}
                aria-pressed={on}
                className={`relative aspect-square overflow-hidden rounded-lg bg-zinc-100 ring-2 ${on ? 'ring-zinc-900' : 'ring-transparent'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.kind === 'video' ? (m.posterUrl ?? '') : m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                {m.kind === 'video' && (
                  <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded bg-black/70 px-1 text-[10px] text-white">
                    <Film size={10} /> {secs(m.durationMs)}
                  </span>
                )}
                {on && (
                  <span className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-[10px] text-white">
                    {multiple ? n + 1 : <Check size={12} />}
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
            onPick(selected.map((id) => items!.find((i) => i.id === id)!).filter(Boolean))
            onClose()
          }}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Use {selected.length > 1 ? `${selected.length} ` : ''}selected
        </button>
      </div>
    </Modal>
  )
}
