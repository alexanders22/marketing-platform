'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Clapperboard, Film, ImageIcon, Loader2, Palette, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { Modal } from '@/components/ui/Popover'
import { CLIP_QUALITIES, FORMATS, type ClipQuality, type Format } from '@/lib/video'
import { createVideo, createVideoFromTemplate, createVideoWithAI, deleteVideo } from './actions'
import { templatePhotoUrl } from '@/lib/design'
import { VIDEO_TEMPLATES } from '@/lib/video-templates'
import { VideoMediaPicker, type LibraryItem } from './VideoMediaPicker'
import { VeoMeter } from './[id]/VideoEditor'
import { clipAction } from '@/lib/pricing'
import { usePrices } from '@/components/Prices'

export type VideoCard = { id: string; name: string; format: string; status: string; poster: string | null; seconds: number; updatedAt: string }

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-zinc-100 text-zinc-600' },
  RENDERING: { label: 'Rendering…', cls: 'bg-amber-50 text-amber-700' },
  READY: { label: 'Ready', cls: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Failed', cls: 'bg-red-50 text-red-700' },
}

export function VideoSection({
  videos,
  paid,
  veo,
  characters = [],
  initialAiBrief,
}: {
  // Opened from a campaign: the AI video starts with its brief.
  initialAiBrief?: string
  videos: VideoCard[]
  paid: boolean
  veo: { used: number; limit: number; left: number } | null
  characters?: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [ai, setAi] = useState(Boolean(initialAiBrief))
  const [, start] = useTransition()

  const [tplFormat, setTplFormat] = useState<Format>('9:16')
  const fromTemplate = (id: string) => {
    setBusy(id)
    start(async () => {
      const res = await createVideoFromTemplate(id, tplFormat)
      if ('id' in res && res.id) router.push(`/app/studio/video/${res.id}`)
      else setBusy(null)
    })
  }

  const create = (f: Format) => {
    setBusy(f)
    start(async () => {
      const { id } = await createVideo(f)
      router.push(`/app/studio/video/${id}`)
    })
  }

  return (
    <section aria-labelledby="video-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="video-heading" className="inline-flex items-center gap-2 text-lg font-semibold">
            <Clapperboard size={19} /> Video
          </h2>
          <p className="text-sm text-zinc-500">Reels and Stories from your photos and clips — text, motion, voice-over, music and your logo at the end.</p>
        </div>
        <button onClick={() => setAi(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
          <Wand2 size={15} /> Create video with AI
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(FORMATS) as Format[]).map((f) => (
          <button
            key={f}
            onClick={() => create(f)}
            disabled={busy !== null}
            aria-label={`New ${FORMATS[f].name} video`}
            className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-300 p-3 text-left hover:bg-zinc-50 disabled:opacity-60"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center">
              <span className="block rounded bg-zinc-900" style={{ width: (FORMATS[f].w / Math.max(FORMATS[f].w, FORMATS[f].h)) * 40, height: (FORMATS[f].h / Math.max(FORMATS[f].w, FORMATS[f].h)) * 40 }} />
            </span>
            <span>
              <span className="block text-sm font-semibold">{busy === f ? <Loader2 size={14} className="inline animate-spin" /> : FORMATS[f].name}</span>
              <span className="block text-xs text-zinc-500">{f}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold">Templates · Real estate</h3>
          <p className="text-sm text-zinc-500">Ready scenes, text and voice-over script — swap in your photos and numbers.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          Format
          <select value={tplFormat} onChange={(e) => setTplFormat(e.target.value as Format)} aria-label="Template format" className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm">
            {(Object.keys(FORMATS) as Format[]).map((f) => (
              <option key={f} value={f}>
                {FORMATS[f].name} ({f})
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Video templates">
        {VIDEO_TEMPLATES.map((t) => {
          const seconds = t.scenes.reduce((a, s) => a + s.seconds, 0)
          return (
            <li key={t.id}>
              <button onClick={() => fromTemplate(t.id)} disabled={busy !== null} aria-label={`Use video template ${t.name}`} className="group block w-full text-left disabled:opacity-60">
                <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-zinc-200 transition group-hover:ring-zinc-400">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={templatePhotoUrl(t.scenes[0].photo)} alt="" className="h-full w-full object-cover opacity-90 transition group-hover:scale-105" />
                  <span className="absolute inset-x-2 bottom-2 rounded-md bg-black/55 px-2 py-1 text-center text-xs font-bold text-white">{t.scenes[0].text.split('\n')[0]}</span>
                  <span className="absolute top-1.5 left-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700">
                    {t.scenes.length} scenes · {Math.round(seconds)}s
                  </span>
                  {busy === t.id && (
                    <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                      <Loader2 className="animate-spin" />
                    </span>
                  )}
                </div>
                <p className="mt-1.5 truncate text-sm font-medium">{t.name}</p>
                <p className="truncate text-xs text-zinc-500">{t.blurb}</p>
              </button>
            </li>
          )
        })}
      </ul>

      {videos.length > 0 && (
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" aria-label="Your videos">
          {videos.map((v) => (
            <li key={v.id} className="group relative">
              <Link href={`/app/studio/video/${v.id}`} className="block">
                <div className="relative grid aspect-[9/16] place-items-center overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-zinc-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {v.poster ? <img src={v.poster} alt="" className="h-full w-full object-cover" /> : <Film className="text-zinc-500" />}
                  <span className={`absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS[v.status]?.cls}`}>{STATUS[v.status]?.label}</span>
                </div>
                <p className="mt-1.5 truncate text-sm font-medium">{v.name}</p>
                <p className="text-xs text-zinc-500">
                  {v.format} · {v.seconds.toFixed(0)}s
                </p>
              </Link>
              <button
                onClick={() => confirm(`Delete “${v.name}”?`) && start(() => deleteVideo(v.id))}
                aria-label={`Delete ${v.name}`}
                className="absolute top-1.5 right-1.5 hidden rounded-md bg-white/90 p-1 text-zinc-700 group-hover:block hover:text-red-600"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {ai && <AiVideoModal paid={paid} veo={veo} characters={characters} initialBrief={initialAiBrief} onClose={() => setAi(false)} />}
    </section>
  )
}

function AiVideoModal({
  onClose,
  paid,
  veo,
  characters,
  initialBrief = '',
}: {
  initialBrief?: string
  onClose: () => void
  paid: boolean
  veo: { used: number; limit: number; left: number } | null
  characters: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [brief, setBrief] = useState(initialBrief)
  const [format, setFormat] = useState<Format>('9:16')
  const [scenes, setScenes] = useState(5)
  const [visuals, setVisuals] = useState<'library' | 'ai' | 'veo' | 'none'>('library')
  const [clipQuality, setClipQuality] = useState<ClipQuality>('quick')
  const [veoMode, setVeoMode] = useState<'text' | 'photos' | 'character'>('text')
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? '')
  // Veo keeps a character only on Pro/Cinema, in 8-second clips.
  const clipSeconds = veoMode === 'character' ? 8 : 4
  const quality: ClipQuality = veoMode === 'character' && clipQuality === 'quick' ? 'pro' : clipQuality
  const [media, setMedia] = useState<LibraryItem[]>([])
  const [picking, setPicking] = useState(false)
  const [voice, setVoice] = useState(true)
  const [language, setLanguage] = useState('English')
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  const P = usePrices()
  const cost = P.videoScript + (voice ? P.voice : 0) + (visuals === 'ai' ? scenes * P.image : 0) + (visuals === 'veo' ? scenes * P[clipAction(quality)] * clipSeconds : 0)

  const go = () =>
    start(async () => {
      setError(undefined)
      const res = await createVideoWithAI({
        brief,
        format,
        scenes,
        visuals,
        clipQuality: quality,
        veoMode,
        characterId: veoMode === 'character' ? characterId : null,
        mediaIds: media.map((m) => m.id),
        voice,
        language,
      })
      if (res.error || !res.id) return setError(res.error)
      router.push(`/app/studio/video/${res.id}`)
    })

  return (
    <Modal title="Create video with AI" onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm font-medium">
          What is the video about?
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="e.g. Weekend custom cakes: order by Thursday, delivery across Tbilisi"
            className="mt-1.5 min-h-24 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal outline-none focus:border-zinc-400"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value as Format)} className="mt-1.5 w-full rounded-lg border border-zinc-200 px-2 py-2 text-sm font-normal">
              {(Object.keys(FORMATS) as Format[]).map((f) => (
                <option key={f} value={f}>
                  {f} · {FORMATS[f].name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Scenes
            <select value={scenes} onChange={(e) => setScenes(Number(e.target.value))} className="mt-1.5 w-full rounded-lg border border-zinc-200 px-2 py-2 text-sm font-normal">
              {[3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <p className="text-sm font-medium">Pictures</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ['library', ImageIcon, 'My photos & clips'],
                ['ai', Sparkles, `AI images · ${scenes * P.image} cr`],
                ['veo', Clapperboard, 'AI clips (Veo)'],
                ['none', Palette, 'Brand colours'],
              ] as const
            ).map(([v, Icon, l]) => (
              <button
                key={v}
                onClick={() => setVisuals(v)}
                disabled={v === 'veo' && !paid}
                title={v === 'veo' && !paid ? 'Paid plans only' : undefined}
                aria-pressed={visuals === v}
                className={`flex flex-col items-center gap-1 rounded-xl p-2.5 text-xs font-medium ring-1 disabled:cursor-not-allowed disabled:opacity-40 ${visuals === v ? 'bg-zinc-900 text-white ring-zinc-900' : 'ring-zinc-200 hover:bg-zinc-50'}`}
              >
                <Icon size={16} /> {l}
              </button>
            ))}
          </div>
          {!paid && (
            <p className="mt-2 text-xs text-zinc-500">
              AI clips (Veo) are part of paid plans.{' '}
              <Link href="/app/plan" className="font-medium text-indigo-600 underline">
                Choose a plan
              </Link>
            </p>
          )}
          {visuals === 'veo' && (
            <div className="mt-2 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-900">
              <p>A real moving {clipSeconds}-second clip for every scene, made by Google Veo. They arrive in the editor within a few minutes.</p>
              <div role="radiogroup" aria-label="Clip source" className="mt-2 grid grid-cols-3 gap-1">
                {(
                  [
                    ['text', 'From the script'],
                    ['photos', 'Animate my photos'],
                    ['character', 'With a character'],
                  ] as const
                ).map(([m, l]) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={veoMode === m}
                    onClick={() => setVeoMode(m)}
                    className={`rounded-lg px-2 py-1.5 font-medium ring-1 ${veoMode === m ? 'bg-zinc-900 text-white ring-zinc-900' : 'bg-white ring-zinc-200'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {veoMode === 'photos' && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {media
                    .filter((m) => m.kind === 'image')
                    .map((m) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={m.id} src={m.url} alt="" className="h-12 w-12 rounded-lg object-cover ring-1 ring-zinc-200" />
                    ))}
                  <button onClick={() => setPicking(true)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 font-medium hover:bg-zinc-50">
                    {media.length ? 'Change photos' : 'Pick photos to animate'}
                  </button>
                  <span>Each photo becomes a moving clip, in order.</span>
                </div>
              )}
              {veoMode === 'character' &&
                (characters.length ? (
                  <label className="mt-2 flex items-center gap-2">
                    Character
                    <select value={characterId} onChange={(e) => setCharacterId(e.target.value)} aria-label="Character" className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs">
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <span>Same person in every scene · Pro or Cinema, 8 s per clip.</span>
                  </label>
                ) : (
                  <p className="mt-2">
                    No characters yet.{' '}
                    <Link href="/app/studio/characters" className="font-medium underline">
                      Add one from your photos
                    </Link>{' '}
                    — then the same person appears in every clip.
                  </p>
                ))}
              {veo && (
                <div className="mt-2">
                  <VeoMeter veo={veo} need={scenes * clipSeconds} />
                </div>
              )}
              <div role="radiogroup" aria-label="Clip quality" className="mt-2 flex gap-1">
                {(Object.keys(CLIP_QUALITIES) as ClipQuality[]).map((q) => (
                  <button
                    key={q}
                    role="radio"
                    aria-checked={quality === q}
                    onClick={() => setClipQuality(q)}
                    disabled={veoMode === 'character' && q === 'quick'}
                    className={`rounded-lg px-2.5 py-1 font-medium ring-1 disabled:opacity-40 ${quality === q ? 'bg-zinc-900 text-white ring-zinc-900' : 'bg-white ring-zinc-200'}`}
                  >
                    {CLIP_QUALITIES[q].label} · {P[clipAction(q)] * clipSeconds * scenes} cr
                  </button>
                ))}
              </div>
            </div>
          )}
          {visuals === 'library' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {media.map((m) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={m.id} src={m.kind === 'video' ? (m.posterUrl ?? '') : m.url} alt="" className="h-12 w-12 rounded-lg object-cover ring-1 ring-zinc-200" />
              ))}
              <button onClick={() => setPicking(true)} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium hover:bg-zinc-50">
                {media.length ? 'Change' : 'Pick photos & clips'}
              </button>
              {media.length === 0 && <span className="text-xs text-zinc-500">Used in order, one per scene.</span>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Voice-over
          </label>
          <label className="flex items-center gap-2 text-sm">
            Language
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-lg border border-zinc-200 px-2 py-1 text-sm">
              {['English', 'Georgian', 'Russian'].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
            Cancel
          </button>
          <button
            onClick={go}
            disabled={
              pending ||
              brief.trim().length < 3 ||
              (visuals === 'veo' && veo !== null && veo.left < scenes * clipSeconds) ||
              (visuals === 'veo' && veoMode === 'photos' && !media.some((m) => m.kind === 'image')) ||
              (visuals === 'veo' && veoMode === 'character' && !characterId)
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {pending ? 'Writing and drawing…' : `Create · up to ${cost} credits`}
          </button>
        </div>
      </div>
      {picking && <VideoMediaPicker kind="visual" multiple onClose={() => setPicking(false)} onPick={setMedia} />}
    </Modal>
  )
}
