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

// AI clips (Google Veo 3.1): credits per second of clip.
export const CLIP_QUALITIES = {
  quick: { label: 'Quick', perSecond: 1, hint: 'Good for most scenes' },
  pro: { label: 'Pro', perSecond: 2, hint: 'Sharper motion and detail' },
  cinema: { label: 'Cinema', perSecond: 5, hint: 'Best quality, slowest' },
} as const
export type ClipQuality = keyof typeof CLIP_QUALITIES
export const CLIP_SECONDS = [4, 6, 8] as const
export const clipCredits = (q: ClipQuality, seconds: number) => CLIP_QUALITIES[q].perSecond * seconds
