'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ExternalLink, Library, Loader2, Music, Pause, Play, Search, Sparkles, Upload, Wand2 } from 'lucide-react'
import { Modal } from '@/components/ui/Popover'
import { usePrices } from '@/components/Prices'
import { creditsLabel } from '@/lib/pricing'
import type { FreeTrack } from '@/lib/music'
import { addFreeMusic, findFreeMusic, generateTrack, listVideoMedia } from './actions'
import { uploadAny, type LibraryItem } from './VideoMediaPicker'

export type MusicItem = LibraryItem & { credit?: string | null }

const MOODS = ['Upbeat', 'Calm', 'Corporate', 'Cinematic', 'Lo-fi', 'Acoustic', 'Electronic', 'Happy']
const secs = (ms: number | null) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}` : '')
const uniq = (list: MusicItem[]) => list.filter((m, i) => list.findIndex((x) => x.id === m.id) === i)

type Tab = 'mine' | 'free' | 'ai'

// Music for a video: your own tracks, free Creative Commons music
// (Openverse) or a track made by AI (Lyria). Picking one closes the dialog.
export function MusicPicker({ onPick, onClose }: { onPick: (item: MusicItem) => void; onClose: () => void }) {
  const P = usePrices()
  const [tab, setTab] = useState<Tab>('mine')
  const [mine, setMine] = useState<MusicItem[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string>()
  const [playing, setPlaying] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement>(null)
  const file = useRef<HTMLInputElement>(null)

  // Free library
  const [q, setQ] = useState('')
  const [tracks, setTracks] = useState<FreeTrack[] | null>(null)
  // AI
  const [prompt, setPrompt] = useState('')
  const [made, setMade] = useState<MusicItem[]>([])

  useEffect(() => {
    listVideoMedia('audio').then((list) => setMine((cur) => uniq([...(cur ?? []), ...list])))
  }, [])

  const stop = () => {
    audio.current?.pause()
    setPlaying(null)
  }
  const toggle = (id: string, url: string) => {
    const a = audio.current
    if (!a) return
    if (playing === id) return stop()
    a.src = url
    a.play().then(() => setPlaying(id), () => setError('This track can’t be played here'))
  }
  const choose = (item: MusicItem) => {
    stop()
    onPick(item)
    onClose()
  }
  const go = (t: Tab) => {
    stop()
    setError(undefined)
    setTab(t)
    if (t === 'free' && tracks === null) search(MOODS[0])
  }

  const search = async (words: string) => {
    setBusy('search')
    setError(undefined)
    const res = await findFreeMusic(words).catch(() => ({ error: 'The free library is not reachable right now.', tracks: undefined }))
    setBusy(null)
    if (res.error) return setError(res.error)
    setTracks(res.tracks ?? [])
  }

  const upload = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    setBusy('upload')
    setError(undefined)
    try {
      const item = await uploadAny(f)
      setMine((cur) => uniq([item, ...(cur ?? [])]))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    }
    setBusy(null)
  }

  const add = async (t: FreeTrack) => {
    setBusy(t.id)
    setError(undefined)
    const res = await addFreeMusic(t.id).catch(() => ({ error: 'Could not add this track', item: undefined }))
    setBusy(null)
    if (res.error || !res.item) return setError(res.error ?? 'Could not add this track')
    choose(res.item)
  }

  const generate = async () => {
    setBusy('ai')
    setError(undefined)
    const res = await generateTrack(prompt).catch(() => ({ error: 'Could not make the track — check your connection and try again.', item: undefined }))
    setBusy(null)
    if (res.error || !res.item) return setError(res.error ?? 'Could not make the track')
    setMine((cur) => uniq([res.item!, ...(cur ?? [])]))
    setMade((cur) => [res.item!, ...cur])
  }

  return (
    <Modal title="Music" onClose={onClose}>
      <audio ref={audio} onEnded={() => setPlaying(null)} hidden />
      <div role="tablist" aria-label="Where the music comes from" className="mb-4 grid grid-cols-3 rounded-xl bg-zinc-100 p-1 text-sm">
        {(
          [
            ['mine', 'My music', Music],
            ['free', 'Free library', Library],
            ['ai', 'AI music', Wand2],
          ] as const
        ).map(([t, label, Icon]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => go(t)} className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 font-medium ${tab === t ? 'bg-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {tab === 'mine' && (
        <>
          <input ref={file} type="file" hidden accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,.mp3,.m4a,.wav,.ogg" onChange={(e) => (upload(e.target.files), (e.target.value = ''))} />
          <button
            onClick={() => file.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => (e.preventDefault(), upload(e.dataTransfer.files))}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 py-4 text-sm text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
          >
            {busy === 'upload' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Upload music (MP3, M4A, WAV)
          </button>
          <p className="mt-2 text-xs text-zinc-500">Use music you have the rights to — Instagram and Facebook mute tracks they recognise as copyrighted.</p>
          {mine === null ? (
            <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>
          ) : mine.length === 0 ? (
            <div className="py-6 text-center text-sm text-zinc-500">
              Nothing yet — pick a track from the{' '}
              <button onClick={() => go('free')} className="font-medium text-violet-700 underline">
                free library
              </button>{' '}
              or{' '}
              <button onClick={() => go('ai')} className="font-medium text-violet-700 underline">
                make one with AI
              </button>
              .
            </div>
          ) : (
            <ul className="mt-4 max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {mine.map((m) => <TrackRow key={m.id} title={m.name || 'Audio'} sub={[secs(m.durationMs), m.credit && 'credit added to the post'].filter(Boolean).join(' · ')} playing={playing === m.id} onToggle={() => toggle(m.id, m.url)} right={<PickButton onClick={() => choose(m)} busy={busy === m.id} disabled={busy !== null} />} />)}
            </ul>
          )}
        </>
      )}

      {tab === 'free' && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              search(q)
            }}
            className="flex gap-2"
          >
            <label className="relative min-w-0 flex-1">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mood, genre or instrument" aria-label="Search free music" className="w-full rounded-lg border border-zinc-200 py-2 pr-3 pl-9 text-sm outline-none focus:border-zinc-400" />
            </label>
            <button disabled={busy === 'search'} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Search
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <button key={m} onClick={() => (setQ(m), search(m))} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-200">
                {m}
              </button>
            ))}
          </div>
          {busy === 'search' ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
              <Loader2 size={15} className="animate-spin" /> Searching…
            </p>
          ) : tracks && tracks.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No tracks found — try other words.</p>
          ) : (
            tracks && (
              <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {tracks.map((t) => (
                  <TrackRow
                    key={t.id}
                    title={t.title}
                    sub={`${t.creator} · ${secs(t.durationMs)} · ${t.license}`}
                    playing={playing === t.id}
                    onToggle={() => toggle(t.id, t.previewUrl)}
                    right={
                      <span className="flex shrink-0 items-center gap-1">
                        {t.pageUrl && (
                          <a href={t.pageUrl} target="_blank" rel="noreferrer" aria-label={`${t.title} on ${t.source}`} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
                            <ExternalLink size={13} />
                          </a>
                        )}
                        <PickButton onClick={() => add(t)} busy={busy === t.id} disabled={busy !== null} />
                      </span>
                    }
                  />
                ))}
              </ul>
            )
          )}
          <p className="mt-3 text-xs text-zinc-500">
            Free Creative Commons music via Openverse — only tracks you may use in ads (CC0, public domain, CC BY). For CC BY tracks the credit line is added to the post text.
          </p>
        </>
      )}

      {tab === 'ai' && (
        <>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Describe the music</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Warm acoustic guitar, upbeat and sunny, for a café opening"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <button key={m} onClick={() => setPrompt((p) => (p.toLowerCase().includes(m.toLowerCase()) ? p : `${p ? `${p.trim()}, ` : ''}${m.toLowerCase()}`))} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-200">
                + {m}
              </button>
            ))}
          </div>
          <button
            onClick={generate}
            disabled={busy !== null || prompt.trim().length < 3}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7b3ff2] to-[#ff2e6e] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'ai' ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {busy === 'ai' ? 'Composing… up to a minute' : `Make a 30-second track · ${creditsLabel(P.music)}`}
          </button>
          <p className="mt-2 text-xs text-zinc-500">Instrumental, made with Google Lyria. New tracks are kept in My music.</p>
          {made.length > 0 && <ul className="mt-4 space-y-1.5">{made.map((m) => <TrackRow key={m.id} title={m.name} sub={secs(m.durationMs)} playing={playing === m.id} onToggle={() => toggle(m.id, m.url)} right={<PickButton onClick={() => choose(m)} busy={busy === m.id} disabled={busy !== null} />} />)}</ul>}
        </>
      )}
    </Modal>
  )
}

function TrackRow({ title, sub, playing, onToggle, right }: { title: string; sub?: string; playing: boolean; onToggle: () => void; right: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 ring-1 ring-zinc-200 hover:bg-zinc-50">
      <button
        onClick={onToggle}
        aria-label={playing ? `Pause ${title}` : `Play ${title}`}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${playing ? 'bg-violet-600 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
      >
        {playing ? <Pause size={15} /> : <Play size={15} className="translate-x-px" />}
      </button>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {sub && <span className="block truncate text-xs text-zinc-500">{sub}</span>}
      </span>
      {right}
    </li>
  )
}

function PickButton({ onClick, busy, disabled }: { onClick: () => void; busy: boolean; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Use
    </button>
  )
}
