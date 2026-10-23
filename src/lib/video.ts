// Studio video model — shared by the editor (client), validation and the
// renderer. Times are in seconds; sizes in output pixels.

export const FORMATS = {
  '9:16': { w: 1080, h: 1920, name: 'Reel / Story' },
  '4:5': { w: 1080, h: 1350, name: 'Feed portrait' },
  '1:1': { w: 1080, h: 1080, name: 'Square' },
  '16:9': { w: 1920, h: 1080, name: 'Landscape' },
} as const
export type Format = keyof typeof FORMATS
export const isFormat = (f: string): f is Format => f in FORMATS

export const MOTIONS = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'none'] as const
export type Motion = (typeof MOTIONS)[number]
export const TEXT_STYLES = ['bold', 'box', 'caption', 'minimal'] as const
export type TextStyle = (typeof TEXT_STYLES)[number]
export const POSITIONS = ['top', 'center', 'bottom'] as const
export type Position = (typeof POSITIONS)[number]

// Prebuilt Gemini voices that read well for ads.
export const VOICES = [
  { id: 'Kore', label: 'Kore — warm, female' },
  { id: 'Puck', label: 'Puck — upbeat, male' },
  { id: 'Charon', label: 'Charon — calm, male' },
  { id: 'Aoede', label: 'Aoede — bright, female' },
  { id: 'Fenrir', label: 'Fenrir — energetic, male' },
] as const

// Subtitles: how the lines look.
export const SUB_STYLES = ['box', 'outline', 'brand'] as const
export type SubStyle = (typeof SUB_STYLES)[number]
// One subtitle line; times in seconds from the start of its scene.
export type Cue = { start: number; end: number; text: string }

export type SceneMedia = { id: string; kind: 'image' | 'video'; url: string; durationMs: number | null; posterUrl: string | null }

export type Scene = {
  id: string
  media: SceneMedia | null
  // Background when there is no media.
  color: string
  duration: number
  // Video clips: where in the clip the scene starts.
  clipStart: number
  motion: Motion
  text: string
  position: Position
  style: TextStyle
  // What the voice-over says during this scene, and its generated audio.
  voice: string
  voiceMediaId: string | null
  voiceMs: number | null
  // An AI clip (Veo) being generated for this scene.
  clipJobId?: string | null
  // Video clips: mix the clip's own sound into the video.
  keepAudio?: boolean
  // Subtitle lines (transcribed or edited). Unset: made from the voice-over line.
  subs?: Cue[] | null
}

export type VideoDoc = {
  scenes: Scene[]
  transition: 'cut' | 'fade'
  music: { mediaId: string; url: string; name: string; volume: number } | null
  // Closing card with the logo and brand name.
  endCard: boolean
  voiceName: string
  // Post text to publish the video with (AI videos write one).
  caption?: string
  // Burnt-in subtitles.
  subtitles?: { on: boolean; style: SubStyle }
}

export const MIN_SCENE = 1
export const MAX_SCENE = 20
export const MAX_SCENES = 20
export const END_CARD_SECONDS = 2.5
export const FADE_SECONDS = 0.4

export const uid = () => Math.random().toString(36).slice(2, 10)

export function newScene(color = '#111827', patch: Partial<Scene> = {}): Scene {
  return {
    id: uid(),
    media: null,
    color,
    duration: 3,
    clipStart: 0,
    motion: 'zoom-in',
    text: '',
    position: 'bottom',
    style: 'bold',
    voice: '',
    voiceMediaId: null,
    voiceMs: null,
    ...patch,
  }
}

export function emptyDoc(color = '#111827'): VideoDoc {
  return { scenes: [newScene(color)], transition: 'fade', music: null, endCard: true, voiceName: 'Kore' }
}

// A scene lasts at least as long as its voice-over line (plus a breath).
export const sceneSeconds = (s: Scene) => Math.min(MAX_SCENE, Math.max(s.duration, s.voiceMs ? s.voiceMs / 1000 + 0.4 : 0, MIN_SCENE))

// Every scene (the end card included) with its start time in the final cut.
export function timeline(doc: VideoDoc) {
  const parts = doc.scenes.map((s) => ({ scene: s as Scene | null, seconds: sceneSeconds(s) }))
  if (doc.endCard) parts.push({ scene: null, seconds: END_CARD_SECONDS })
  const fade = doc.transition === 'fade' && parts.length > 1 ? FADE_SECONDS : 0
  let t = 0
  const out = parts.map((p, i) => {
    const start = t
    t += p.seconds - (i < parts.length - 1 ? fade : 0)
    return { ...p, start }
  })
  return { parts: out, total: t, fade }
}

/* ─── Trim and split ─────────────────────────────────────────────────── */

// Seconds of footage in a video clip (null: unknown or not a clip).
export const clipLength = (s: Scene) => (s.media?.kind === 'video' && s.media.durationMs ? s.media.durationMs / 1000 : null)

// Keeps the part of the clip from start to end (seconds in the clip).
export function trimScene(s: Scene, start: number, end: number): Partial<Scene> {
  const len = clipLength(s) ?? start + MAX_SCENE
  const a = Math.max(0, Math.min(start, len - MIN_SCENE))
  const b = Math.min(len, a + MAX_SCENE, Math.max(end, a + MIN_SCENE))
  const r = (n: number) => Math.round(n * 10) / 10
  return { clipStart: r(a), duration: r(b - a) }
}

// Cuts a clip scene in two at `at` seconds into the scene. The first part
// keeps the text and the voice-over; subtitles go with their time.
export function splitScene(s: Scene, at: number): [Scene, Scene] | null {
  const t = Math.round(at * 10) / 10
  if (t < MIN_SCENE || s.duration - t < MIN_SCENE) return null
  const subs = s.subs ?? null
  const first: Scene = { ...s, duration: t, subs: subs && subs.filter((c) => c.start < t).map((c) => ({ ...c, end: Math.min(c.end, t) })) }
  const second: Scene = {
    ...s,
    id: uid(),
    clipStart: Math.round((s.clipStart + t) * 10) / 10,
    duration: Math.round((s.duration - t) * 10) / 10,
    text: '',
    voice: '',
    voiceMediaId: null,
    voiceMs: null,
    clipJobId: null,
    subs: subs && subs.filter((c) => c.end > t).map((c) => ({ ...c, start: Math.max(0, c.start - t), end: c.end - t })),
  }
  return [first, second]
}

/* ─── Subtitles ──────────────────────────────────────────────────────── */

// The voice-over starts this long after its scene (the renderer's delay).
export const VOICE_DELAY = 0.25

// Lines of at most ~6 words / 38 characters, broken after punctuation when it can.
export function subtitleLines(text: string): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const out: string[] = []
  let line: string[] = []
  for (const w of words) {
    const next = [...line, w].join(' ')
    if (line.length && (line.length >= 6 || next.length > 38)) {
      out.push(line.join(' '))
      line = []
    }
    line.push(w)
    if (/[.!?;:,—]$/.test(w) && line.join(' ').length >= 14) {
      out.push(line.join(' '))
      line = []
    }
  }
  if (line.length) out.push(line.join(' '))
  return out
}

// The voice-over line as timed subtitles: each line gets time in proportion to its length.
export function voiceCues(s: Scene): Cue[] {
  if (!s.voice.trim() || !s.voiceMs) return []
  const lines = subtitleLines(s.voice)
  const chars = lines.reduce((n, l) => n + l.length, 0) || 1
  const total = s.voiceMs / 1000
  let t = VOICE_DELAY
  return lines.map((text) => {
    const d = (text.length / chars) * total
    const cue = { start: round2(t), end: round2(t + d), text }
    t += d
    return cue
  })
}

const round2 = (n: number) => Math.round(n * 100) / 100

// The scene's subtitles: its own lines, else the voice-over's; within the scene.
export function cuesOf(s: Scene): Cue[] {
  const len = sceneSeconds(s)
  return (s.subs ?? voiceCues(s))
    .filter((c) => c.text.trim() && c.start < len && c.end > c.start)
    .map((c) => ({ ...c, end: Math.min(c.end, len) }))
}

// The subtitle on screen `t` seconds into the scene.
export const cueAt = (cues: Cue[], t: number) => cues.find((c) => t >= c.start && t < c.end) ?? null

// AI clips (Google Veo 3.1). Credits per second: clipAction() in pricing.ts.
export const CLIP_QUALITIES = {
  quick: { label: 'Quick', hint: 'Good for most scenes' },
  pro: { label: 'Pro', hint: 'Sharper motion and detail' },
  cinema: { label: 'Cinema', hint: 'Best quality, slowest' },
} as const
export type ClipQuality = keyof typeof CLIP_QUALITIES
export const CLIP_SECONDS = [4, 6, 8] as const
