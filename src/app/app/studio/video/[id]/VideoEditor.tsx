'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Clapperboard,
  Copy,
  Download,
  Film,
  ImageIcon,
  Loader2,
  Mic,
  Music,
  Pause,
  Play,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { useIsClient } from '@/components/LocalTime'
import { drawEndCard, drawOverlay, toPngBase64, type OverlayBrand } from '@/lib/video-overlay'
import {
  FORMATS,
  MAX_SCENES,
  MOTIONS,
  newScene,
  POSITIONS,
  sceneSeconds,
  TEXT_STYLES,
  timeline,
  uid,
  VOICES,
  type Format,
  type Scene,
  type VideoDoc,
} from '@/lib/video'
import { generateVoices, renderVideo, saveVideo, videoStatus, videoToPost } from '../actions'
import { VideoMediaPicker, type LibraryItem } from '../VideoMediaPicker'

type Status = { status: 'DRAFT' | 'RENDERING' | 'READY' | 'FAILED'; error: string | null; output: { url: string; poster: string | null } | null }

const MOTION_LABEL: Record<(typeof MOTIONS)[number], string> = {
  'zoom-in': 'Zoom in',
  'zoom-out': 'Zoom out',
  'pan-left': 'Pan left',
  'pan-right': 'Pan right',
  none: 'Still',
}
const STYLE_LABEL: Record<(typeof TEXT_STYLES)[number], string> = { bold: 'Bold', box: 'Brand box', caption: 'Subtitle', minimal: 'Light pill' }

const field = 'w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400'

export function VideoEditor({
  video,
  brand,
  initialStatus,
}: {
  video: { id: string; name: string; format: Format; doc: VideoDoc }
  brand: OverlayBrand
  initialStatus: Status
}) {
  const router = useRouter()
  const [name, setName] = useState(video.name)
  const [format, setFormat] = useState<Format>(video.format)
  const [doc, setDoc] = useState<VideoDoc>(video.doc)
  const [sel, setSel] = useState(doc.scenes[0]?.id ?? '')
  const [tab, setTab] = useState<'scene' | 'video'>('scene')
  const [picker, setPicker] = useState<'scene' | 'music' | null>(null)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved')
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<Status>(initialStatus)
  const [busy, startBusy] = useTransition()
  const [busyWhat, setBusyWhat] = useState<string | null>(null)
  const [view, setView] = useState<'rendered' | 'preview'>('rendered')
  const first = useRef(true)

  const scene = doc.scenes.find((s) => s.id === sel) ?? doc.scenes[0]
  const { total } = timeline(doc)

  // Autosave a second after the last change.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSaveState('dirty')
    const t = setTimeout(async () => {
      setSaveState('saving')
      const res = await saveVideo(video.id, { name, format, doc })
      if (res.error) {
        setSaveState('error')
        setError(res.error)
      } else setSaveState('saved')
    }, 900)
    return () => clearTimeout(t)
  }, [name, format, doc, video.id])

  // While rendering, ask the server every few seconds.
  useEffect(() => {
    if (status.status !== 'RENDERING') return
    const t = setInterval(async () => {
      const s = await videoStatus(video.id)
      if (s && s.status !== 'RENDERING') {
        setStatus(s)
        setView('rendered')
        router.refresh()
      }
    }, 3000)
    return () => clearInterval(t)
  }, [status.status, video.id, router])

  const patchScene = useCallback(
    (id: string, patch: Partial<Scene>) => setDoc((d) => ({ ...d, scenes: d.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
    [],
  )
  const bg = brand.colors[0] && /^#[0-9a-fA-F]{6}$/.test(brand.colors[0]) ? brand.colors[0] : '#111827'
  const addScene = () => {
    if (doc.scenes.length >= MAX_SCENES) return
    const s = newScene(bg)
    const at = doc.scenes.findIndex((x) => x.id === sel)
    setDoc((d) => ({ ...d, scenes: [...d.scenes.slice(0, at + 1), s, ...d.scenes.slice(at + 1)] }))
    setSel(s.id)
  }
  const move = (id: string, by: number) =>
    setDoc((d) => {
      const i = d.scenes.findIndex((s) => s.id === id)
      const j = i + by
      if (j < 0 || j >= d.scenes.length) return d
      const scenes = [...d.scenes]
      ;[scenes[i], scenes[j]] = [scenes[j], scenes[i]]
      return { ...d, scenes }
    })
  const duplicate = (id: string) =>
    setDoc((d) => {
      const i = d.scenes.findIndex((s) => s.id === id)
      if (d.scenes.length >= MAX_SCENES) return d
      const copy = { ...d.scenes[i], id: uid() }
      return { ...d, scenes: [...d.scenes.slice(0, i + 1), copy, ...d.scenes.slice(i + 1)] }
    })
  const remove = (id: string) =>
    setDoc((d) => {
      if (d.scenes.length <= 1) return d
      const scenes = d.scenes.filter((s) => s.id !== id)
      if (sel === id) setSel(scenes[0].id)
      return { ...d, scenes }
    })

  const pickForScene = (items: LibraryItem[]) => {
    const m = items[0]
    if (!m || m.kind === 'audio' || !scene) return
    patchScene(scene.id, {
      media: { id: m.id, kind: m.kind, url: m.url, durationMs: m.durationMs, posterUrl: m.posterUrl },
      clipStart: 0,
      ...(m.kind === 'video' && m.durationMs ? { duration: Math.min(20, Math.max(1, Math.round(m.durationMs / 100) / 10)) } : {}),
    })
  }

  const needVoice = doc.scenes.some((s) => s.voice.trim() && !s.voiceMediaId)

  const makeVoices = () => {
    setBusyWhat('voice')
    startBusy(async () => {
      setError(undefined)
      const ok = await saveVideo(video.id, { name, format, doc })
      if (ok.error) return setError(ok.error)
      const res = await generateVoices(video.id)
      if (res.error) setError(res.error)
      else if (res.doc) {
        first.current = true
        setDoc(res.doc)
      }
      router.refresh()
    })
  }

  const render = () => {
    setBusyWhat('render')
    startBusy(async () => {
      setError(undefined)
      const ok = await saveVideo(video.id, { name, format, doc })
      if (ok.error) return setError(ok.error)
      await document.fonts?.ready
      const parts = timeline(doc).parts
      const overlays: (string | null)[] = []
      for (const p of parts) {
        if (p.scene) overlays.push(p.scene.text.trim() ? toPngBase64(drawOverlay(p.scene, format, brand)) : null)
        else overlays.push(toPngBase64(await drawEndCard(format, brand)))
      }
      const res = await renderVideo(video.id, overlays)
      if (res.error) return setError(res.error)
      setStatus({ status: 'RENDERING', error: null, output: status.output })
    })
  }

  const toPost = () => {
    setBusyWhat('post')
    startBusy(async () => {
      const res = await videoToPost(video.id)
      if (res.error) return setError(res.error)
      router.push(`/app/posts/${res.postId}`)
    })
  }

  return (
    <div className="-m-5 flex min-h-[calc(100vh-1.5rem)] flex-col sm:-m-8">
      <PreviewStyles />
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-3">
        <Link href="/app/studio" className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-100 hover:bg-zinc-200" aria-label="Back to Studio">
          <ArrowLeft size={17} />
        </Link>
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Video name" className="min-w-0 flex-1 rounded-lg px-2 py-1.5 font-semibold outline-none hover:bg-zinc-50 focus:bg-zinc-50 sm:max-w-xs" />
        <select value={format} onChange={(e) => setFormat(e.target.value as Format)} aria-label="Format" className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm">
          {(Object.keys(FORMATS) as Format[]).map((f) => (
            <option key={f} value={f}>
              {f} · {FORMATS[f].name}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500" aria-live="polite">
          {saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved' : saveState === 'error' ? 'Not saved' : 'Saved'} · {total.toFixed(1)}s
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {needVoice && (
            <button onClick={makeVoices} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-60">
              {busy && busyWhat === 'voice' ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />} Generate voice-over · 1 credit
            </button>
          )}
          <button
            onClick={render}
            disabled={busy || status.status === 'RENDERING'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {status.status === 'RENDERING' || (busy && busyWhat === 'render') ? <Loader2 size={15} className="animate-spin" /> : <Clapperboard size={15} />}
            {status.status === 'RENDERING' ? 'Rendering…' : status.output ? 'Render again' : 'Render video'}
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {status.status === 'FAILED' && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">Render failed: {status.error?.split('\n')[0]}</p>}

      <div className="grid flex-1 lg:grid-cols-[230px_1fr_330px]">
        {/* Scenes */}
        <aside className="border-b border-zinc-200 p-3 lg:border-r lg:border-b-0">
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-zinc-500">SCENES</p>
          <ol aria-label="Scenes" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {doc.scenes.map((s, i) => (
              <li key={s.id} className="shrink-0">
                <div
                  className={`group flex w-44 items-center gap-2 rounded-xl p-1.5 lg:w-auto ${s.id === scene?.id ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}
                >
                  <button onClick={() => (setSel(s.id), setTab('scene'), setView('preview'))} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={`Scene ${i + 1}`}>
                    <Thumb scene={s} />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold">
                        {i + 1} · {sceneSeconds(s).toFixed(1)}s
                      </span>
                      <span className={`block truncate text-xs ${s.id === scene?.id ? 'text-zinc-300' : 'text-zinc-500'}`}>{s.text || s.voice || 'No text'}</span>
                    </span>
                  </button>
                </div>
              </li>
            ))}
            {doc.endCard && (
              <li className="shrink-0 px-1.5 py-1 text-xs text-zinc-500">
                + end card · {brand.name}
              </li>
            )}
          </ol>
          <button
            onClick={addScene}
            disabled={doc.scenes.length >= MAX_SCENES}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          >
            <Plus size={15} /> Add scene
          </button>
        </aside>

        {/* Preview */}
        <section className="flex flex-col items-center gap-4 bg-zinc-50 p-4">
          {status.status === 'READY' && status.output && (
            <div role="tablist" aria-label="View" className="flex rounded-lg bg-zinc-200/70 p-1 text-sm">
              {(['rendered', 'preview'] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 font-medium ${view === v ? 'bg-white shadow-sm' : 'text-zinc-600'}`}>
                  {v === 'rendered' ? 'Rendered MP4' : 'Edit preview'}
                </button>
              ))}
            </div>
          )}
          {status.status === 'READY' && status.output && view === 'rendered' ? (
            <div className="w-full max-w-md">
              <video key={status.output.url} src={status.output.url} poster={status.output.poster ?? undefined} controls playsInline className="mx-auto max-h-[60vh] rounded-xl bg-black" aria-label="Rendered video" />
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <a href={status.output.url} download className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50">
                  <Download size={15} /> Download MP4
                </a>
                <button onClick={toPost} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
                  {busy && busyWhat === 'post' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Use in post
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-zinc-500">Changed something? Render again.</p>
            </div>
          ) : (
            <Player doc={doc} format={format} brand={brand} scene={scene} />
          )}
        </section>

        {/* Inspector */}
        <aside className="border-t border-zinc-200 p-4 lg:border-t-0 lg:border-l">
          <div className="mb-4 grid grid-cols-2 rounded-lg bg-zinc-100 p-1 text-sm">
            {(['scene', 'video'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-md py-1.5 font-medium ${tab === t ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>
                {t === 'scene' ? 'Scene' : 'Video'}
              </button>
            ))}
          </div>

          {tab === 'scene' && scene && (
            <div className="space-y-4">
              <div className="flex items-center gap-1">
                <IconBtn label="Move scene up" onClick={() => move(scene.id, -1)}>
                  <ArrowUp size={15} />
                </IconBtn>
                <IconBtn label="Move scene down" onClick={() => move(scene.id, 1)}>
                  <ArrowDown size={15} />
                </IconBtn>
                <IconBtn label="Duplicate scene" onClick={() => duplicate(scene.id)}>
                  <Copy size={15} />
                </IconBtn>
                <IconBtn label="Delete scene" onClick={() => remove(scene.id)} disabled={doc.scenes.length <= 1}>
                  <Trash2 size={15} />
                </IconBtn>
              </div>

              <Field label="Photo or clip">
                {scene.media ? (
                  <div className="flex items-center gap-2">
                    <Thumb scene={scene} big />
                    <div className="flex flex-col gap-1">
                      <button onClick={() => setPicker('scene')} className="text-left text-sm font-medium text-indigo-600 hover:underline">
                        Replace
                      </button>
                      <button onClick={() => patchScene(scene.id, { media: null })} className="text-left text-sm text-zinc-500 hover:underline">
                        Remove — use colour
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPicker('scene')} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50">
                      <ImageIcon size={15} /> Add photo or clip
                    </button>
                    <input type="color" value={scene.color} onChange={(e) => patchScene(scene.id, { color: e.target.value })} aria-label="Background colour" className="h-9 w-10 rounded" />
                  </div>
                )}
              </Field>

              <Field label={`Length · ${sceneSeconds(scene).toFixed(1)}s${scene.voiceMs && sceneSeconds(scene) > scene.duration ? ' (fits the voice-over)' : ''}`}>
                <input type="range" min={1} max={15} step={0.5} value={scene.duration} onChange={(e) => patchScene(scene.id, { duration: Number(e.target.value) })} aria-label="Scene length" className="w-full" />
              </Field>
              {scene.media?.kind === 'video' && (scene.media.durationMs ?? 0) > 1000 && (
                <Field label={`Start the clip at ${scene.clipStart.toFixed(1)}s`}>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, (scene.media.durationMs ?? 0) / 1000 - 1)}
                    step={0.1}
                    value={scene.clipStart}
                    onChange={(e) => patchScene(scene.id, { clipStart: Number(e.target.value) })}
                    aria-label="Clip start"
                    className="w-full"
                  />
                </Field>
              )}
              {scene.media?.kind === 'image' && (
                <Field label="Camera">
                  <Segmented value={scene.motion} options={MOTIONS.map((m) => [m, MOTION_LABEL[m]])} onChange={(v) => patchScene(scene.id, { motion: v })} label="Camera motion" />
                </Field>
              )}

              <Field label="On-screen text">
                <textarea value={scene.text} onChange={(e) => patchScene(scene.id, { text: e.target.value })} placeholder="Short and punchy — 3 to 7 words" aria-label="On-screen text" className={`${field} min-h-16 resize-y`} />
              </Field>
              <Field label="Text style">
                <Segmented value={scene.style} options={TEXT_STYLES.map((s) => [s, STYLE_LABEL[s]])} onChange={(v) => patchScene(scene.id, { style: v })} label="Text style" />
              </Field>
              <Field label="Text position">
                <Segmented value={scene.position} options={POSITIONS.map((p) => [p, p[0].toUpperCase() + p.slice(1)])} onChange={(v) => patchScene(scene.id, { position: v })} label="Text position" />
              </Field>

              <Field label="Voice-over line">
                <textarea
                  value={scene.voice}
                  onChange={(e) => patchScene(scene.id, { voice: e.target.value, voiceMediaId: null, voiceMs: null })}
                  placeholder="What the voice says in this scene (optional)"
                  aria-label="Voice-over line"
                  className={`${field} min-h-16 resize-y`}
                />
                {scene.voice.trim() && <p className="mt-1 text-xs text-zinc-500">{scene.voiceMediaId ? `Voice ready · ${((scene.voiceMs ?? 0) / 1000).toFixed(1)}s` : 'Not voiced yet — use “Generate voice-over” above.'}</p>}
              </Field>
            </div>
          )}

          {tab === 'video' && (
            <div className="space-y-4">
              <Field label="Between scenes">
                <Segmented value={doc.transition} options={[['fade', 'Crossfade'], ['cut', 'Cut']]} onChange={(v) => setDoc({ ...doc, transition: v })} label="Transition" />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={doc.endCard} onChange={(e) => setDoc({ ...doc, endCard: e.target.checked })} /> End card with logo and name
              </label>
              <Field label="Voice">
                <select
                  value={doc.voiceName}
                  onChange={(e) => setDoc({ ...doc, voiceName: e.target.value, scenes: doc.scenes.map((s) => ({ ...s, voiceMediaId: null, voiceMs: null })) })}
                  aria-label="Voice"
                  className={field}
                >
                  {VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Music">
                {doc.music ? (
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 text-sm">
                      <Music size={15} /> <span className="min-w-0 flex-1 truncate">{doc.music.name || 'Track'}</span>
                      <button onClick={() => setDoc({ ...doc, music: null })} aria-label="Remove music" className="text-zinc-500 hover:text-red-600">
                        <X size={15} />
                      </button>
                    </p>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={doc.music.volume}
                      onChange={(e) => setDoc({ ...doc, music: { ...doc.music!, volume: Number(e.target.value) } })}
                      aria-label="Music volume"
                      className="w-full"
                    />
                  </div>
                ) : (
                  <button onClick={() => setPicker('music')} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50">
                    <Music size={15} /> Add music
                  </button>
                )}
              </Field>
              <Field label="Post text">
                <textarea value={doc.caption ?? ''} onChange={(e) => setDoc({ ...doc, caption: e.target.value })} placeholder="Caption used when you post the video" aria-label="Post text" className={`${field} min-h-24 resize-y`} />
              </Field>
            </div>
          )}
        </aside>
      </div>

      {picker === 'scene' && <VideoMediaPicker kind="visual" onClose={() => setPicker(null)} onPick={pickForScene} />}
      {picker === 'music' && (
        <VideoMediaPicker
          kind="audio"
          onClose={() => setPicker(null)}
          onPick={(items) => items[0] && setDoc({ ...doc, music: { mediaId: items[0].id, url: items[0].url, name: items[0].name, volume: 0.6 } })}
        />
      )}
    </div>
  )
}

/* ─── Preview ─────────────────────────────────────────────────────────── */

function PreviewStyles() {
  return (
    <style>{`
      @keyframes lp-zoom-in { from { transform: scale(1) } to { transform: scale(1.12) } }
      @keyframes lp-zoom-out { from { transform: scale(1.12) } to { transform: scale(1) } }
      @keyframes lp-pan-left { from { transform: scale(1.12) translateX(5%) } to { transform: scale(1.12) translateX(-5%) } }
      @keyframes lp-pan-right { from { transform: scale(1.12) translateX(-5%) } to { transform: scale(1.12) translateX(5%) } }
      @keyframes lp-text-in { from { opacity: 0 } to { opacity: 1 } }
    `}</style>
  )
}

// One scene as it will look; "Play" runs the whole timeline with voice and
// music (the export is rendered on the server).
function Player({ doc, format, brand, scene }: { doc: VideoDoc; format: Format; brand: OverlayBrand; scene: Scene | undefined }) {
  const { parts, total } = useMemo(() => timeline(doc), [doc])
  const [playing, setPlaying] = useState<number | null>(null)
  const [endCard, setEndCard] = useState<string>()
  const audio = useRef<HTMLAudioElement[]>([])
  const size = FORMATS[format]
  const shown = playing !== null ? parts[playing] : { scene: scene ?? null, seconds: scene ? sceneSeconds(scene) : 0 }
  // Canvas exists only in the browser: draw after hydration.
  const client = useIsClient()
  const overlay = useMemo(() => (client && shown.scene && shown.scene.text.trim() ? drawOverlay(shown.scene, format, brand).toDataURL() : null), [client, shown.scene, format, brand])

  useEffect(() => {
    if (!doc.endCard) return
    let alive = true
    drawEndCard(format, brand).then((c) => alive && setEndCard(c.toDataURL()))
    return () => {
      alive = false
    }
  }, [doc.endCard, format, brand])

  const stop = useCallback(() => {
    audio.current.forEach((a) => a.pause())
    audio.current = []
    setPlaying(null)
  }, [])

  useEffect(() => {
    if (playing === null) return
    const p = parts[playing]
    if (!p) return
    const voice = p.scene?.voiceMediaId ? new Audio(`/media/${p.scene.voiceMediaId}`) : null
    const t0 = voice ? setTimeout(() => voice.play().catch(() => {}), 250) : null
    if (voice) audio.current.push(voice)
    const next = setTimeout(() => setPlaying((i) => (i === null ? null : i + 1 < parts.length ? i + 1 : null)), p.seconds * 1000)
    return () => {
      clearTimeout(next)
      if (t0) clearTimeout(t0)
    }
  }, [playing, parts])

  useEffect(() => {
    if (playing === null) audio.current.forEach((a) => a.pause())
  }, [playing])

  const play = () => {
    if (playing !== null) return stop()
    if (doc.music) {
      const m = new Audio(doc.music.url)
      m.volume = doc.music.volume
      m.loop = true
      m.play().catch(() => {})
      audio.current.push(m)
    }
    setPlaying(0)
  }

  const maxH = 520
  const scale = Math.min(maxH / size.h, 360 / size.w)
  const s = shown.scene
  const anim = s?.media?.kind === 'image' && s.motion !== 'none' ? `lp-${s.motion} ${shown.seconds}s linear both` : undefined
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        aria-label="Preview"
        className="relative overflow-hidden rounded-xl bg-black shadow-lg"
        style={{ width: size.w * scale, height: size.h * scale, background: s ? s.color : undefined }}
      >
        {s?.media?.kind === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${s.id}-${playing}`} src={s.media.url} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ animation: anim }} />
        )}
        {s?.media?.kind === 'video' && (
          <video
            key={`${s.id}-${playing}-${s.clipStart}`}
            src={`${s.media.url}#t=${s.clipStart}`}
            muted
            autoPlay
            playsInline
            loop
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {!s && endCard && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={endCard} alt="" className="absolute inset-0 h-full w-full" />
        )}
        {overlay && (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`o-${s?.id}-${playing}`} src={overlay} alt="" className="pointer-events-none absolute inset-0 h-full w-full" style={{ animation: 'lp-text-in .35s .15s both' }} />
        )}
      </div>
      <button onClick={play} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50">
        {playing !== null ? <Pause size={15} /> : <Play size={15} />} {playing !== null ? 'Stop' : `Play preview · ${total.toFixed(1)}s`}
      </button>
    </div>
  )
}

function Thumb({ scene, big = false }: { scene: Scene; big?: boolean }) {
  const src = scene.media ? (scene.media.kind === 'video' ? scene.media.posterUrl : scene.media.url) : null
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-lg ${big ? 'h-20 w-14' : 'h-12 w-9'}`} style={{ background: scene.color }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
      {scene.media?.kind === 'video' && <Film size={11} className="absolute right-0.5 bottom-0.5 text-white drop-shadow" />}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      {children}
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map(([v, l]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ${value === v ? 'bg-zinc-900 text-white ring-zinc-900' : 'ring-zinc-200 hover:bg-zinc-50'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100 disabled:opacity-30">
      {children}
    </button>
  )
}
