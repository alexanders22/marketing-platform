'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Check, Link2, Loader2, Sparkles, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Popover'
import { usePrices } from '@/components/Prices'
import { creditsLabel } from '@/lib/pricing'
import type { StyleView } from '@/lib/style-ref'
import { copyStyleFrom } from '@/app/app/studio/styles/actions'
import { uploadAny } from '@/app/app/studio/video/VideoMediaPicker'

// "Make it like this": a link (YouTube, a page or a file) or an upload is read
// by the AI into a reusable style.

const WATCHING = {
  VIDEO: ['Opening the video', 'Watching it frame by frame', 'Noting pacing, text and transitions', 'Listening to the voice and music', 'Writing the recipe'],
  IMAGE: ['Opening the picture', 'Reading light and colour', 'Noting composition and texture', 'Writing the style'],
}

export function CopyStyleDialog({ kind, onDone, onClose }: { kind: 'IMAGE' | 'VIDEO'; onDone: (s: StyleView) => void; onClose: () => void }) {
  const P = usePrices()
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<StyleView | null>(null)
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  const video = kind === 'VIDEO'
  const lines = WATCHING[kind]

  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => setStep((s) => Math.min(s + 1, lines.length - 1)), video ? 9000 : 4000)
    return () => clearInterval(t)
  }, [pending, lines.length, video])

  const go = () => {
    if (!url.trim() && !file) return setError(video ? 'Paste a link or upload a video' : 'Paste a link or upload a picture')
    setError(undefined)
    setStep(0)
    start(async () => {
      let mediaId: string | undefined
      if (file) {
        try {
          const item = await uploadAny(file)
          if ((item.kind === 'video') !== video) return setError(video ? 'That is not a video' : 'That is not a picture')
          mediaId = item.id
        } catch (e) {
          return setError(e instanceof Error ? e.message : 'Upload failed')
        }
      }
      const res = await copyStyleFrom({ kind, url: file ? undefined : url, mediaId })
      if (res.error || !res.style) return setError(res.error ?? 'Could not read this style')
      setResult(res.style)
    })
  }

  return (
    <Modal title={video ? 'Make a video like this one' : 'Make pictures like this one'} onClose={onClose}>
      {result ? (
        <div className="space-y-4">
          <div className="flex gap-4 rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-100">
            {result.thumbUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.thumbUrl} alt="" className={`shrink-0 rounded-xl object-cover ${video ? 'h-28 w-20' : 'h-24 w-24'}`} />
            )}
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <Check size={13} /> Style saved
              </p>
              <p className="mt-0.5 text-lg font-semibold">{result.name}</p>
              <p className="text-sm text-zinc-600">{result.summary}</p>
              {result.palette.length > 0 && (
                <div className="mt-2 flex gap-1" aria-label="Palette">
                  {result.palette.map((c) => (
                    <span key={c} title={c} className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: c }} />
                  ))}
                </div>
              )}
              {result.beats && <p className="mt-2 text-xs text-zinc-500">{result.beats} scenes in the same rhythm, text, transitions, voice and music</p>}
            </div>
          </div>
          <button onClick={() => onDone(result)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7b3ff2] via-[#ff2e6e] to-[#ff5b14] px-5 py-3 text-sm font-semibold text-white hover:brightness-110">
            <Sparkles size={16} /> Use this style
          </button>
        </div>
      ) : pending ? (
        <ul className="space-y-2" aria-live="polite">
          {lines.map((l, i) => (
            <li key={l} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${i <= step ? 'bg-zinc-50 text-zinc-800' : 'text-zinc-400'}`}>
              {i < step ? <Check size={16} className="text-emerald-600" /> : i === step ? <Loader2 size={16} className="animate-spin text-[#7b3ff2]" /> : <span className="mx-1 h-2 w-2 rounded-full bg-zinc-200" />}
              {l}
            </li>
          ))}
          <li className="px-3 pt-1 text-xs text-zinc-500">{video ? 'Usually under a minute; long videos take longer.' : 'A few seconds.'}</li>
        </ul>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">
            {video
              ? 'Loudpilot watches it and copies the look and the recipe — scenes and rhythm, on-screen text, transitions, voice and music — to make videos for your brand the same way.'
              : 'Loudpilot reads the look — light, colours, texture, composition — and makes new pictures for your brand in the same style.'}
          </p>
          <label className="block text-sm font-medium">
            Link
            <span className="relative mt-1.5 block">
              <Link2 size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
              <input
                value={url}
                onChange={(e) => (setUrl(e.target.value), setFile(null), setError(undefined))}
                placeholder={video ? 'YouTube or Shorts link, or a link to a video file' : 'Link to a picture or a page with it'}
                className="w-full rounded-lg border border-zinc-200 py-2.5 pr-3 pl-9 text-sm font-normal outline-none focus:border-zinc-400"
              />
            </span>
          </label>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200" /> or <span className="h-px flex-1 bg-zinc-200" />
          </div>
          <input ref={input} type="file" accept={video ? 'video/mp4,video/quicktime,video/webm' : 'image/png,image/jpeg,image/webp'} className="hidden" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setUrl(''), setError(undefined))} aria-label={video ? 'Upload a video' : 'Upload a picture'} />
          <button onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            <Upload size={16} /> {file ? file.name : video ? 'Upload a video (up to 3 minutes)' : 'Upload a picture'}
          </button>
          {video && <p className="text-xs text-zinc-500">From Instagram, TikTok or Facebook? Those links can’t be read — save the video and upload it.</p>}
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button onClick={go} className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800">
            <Sparkles size={16} /> Copy the style · {creditsLabel(video ? P.styleVideo : P.styleImage)}
          </button>
        </div>
      )}
    </Modal>
  )
}
