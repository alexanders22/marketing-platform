'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { aiEnabled, generateImage, generateMusic, LANGUAGES, speak, videoScript } from '@/lib/ai'
import { importFreeMusic, saveGeneratedMusic, searchFreeMusic, type FreeTrack } from '@/lib/music'
import { requireContext } from '@/lib/context'
import { charge, notEnough, prices } from '@/lib/credits'
import { withDossier } from '@/lib/dossier'
import { prisma } from '@/lib/prisma'
import { TEMPLATE_PHOTO } from '@/lib/design'
import { templatePhotos } from '@/lib/template-photos'
import { VIDEO_TEMPLATES } from '@/lib/video-templates'
import { mediaUrl, saveMedia } from '@/lib/storage'
import { emptyDoc, FORMATS, isFormat, MAX_SCENES, MOTIONS, newScene, POSITIONS, TEXT_STYLES, timeline, VOICES, type Format, type SceneMedia, type VideoDoc } from '@/lib/video'
import { enqueueRender } from '@/lib/video-render'
import { advanceClip, CLIP_QUALITIES, CLIP_SECONDS, startVeo, veoAspect, veoEnabled, type ClipQuality } from '@/lib/veo'
import { isPaid, PAID_ONLY } from '@/lib/plans'
import { veoAllowance, veoLimitMessage } from '@/lib/credits'
import { clipAction } from '@/lib/pricing'
import { aiError } from '@/lib/ai-health'
import { IMAGE_STYLES, SKETCH_PAPER } from '@/lib/image-styles'

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const SceneSchema = z.object({
  id: z.string().max(20),
  media: z
    .object({
      id: z.string().max(40),
      kind: z.enum(['image', 'video']),
      url: z.string().regex(/^\/media\/[a-z0-9]+$/),
      durationMs: z.number().int().nullable(),
      posterUrl: z.string().regex(/^\/media\/[a-z0-9]+$/).nullable(),
    })
    .nullable(),
  color,
  duration: z.number().min(0.5).max(20),
  clipStart: z.number().min(0).max(600),
  motion: z.enum(MOTIONS),
  text: z.string().max(300),
  position: z.enum(POSITIONS),
  style: z.enum(TEXT_STYLES),
  voice: z.string().max(400),
  voiceMediaId: z.string().max(40).nullable(),
  voiceMs: z.number().int().min(0).max(120_000).nullable(),
  clipJobId: z.string().max(40).nullable().optional(),
  keepAudio: z.boolean().optional(),
})
const DocSchema = z.object({
  scenes: z.array(SceneSchema).min(1, 'Add at least one scene').max(MAX_SCENES),
  transition: z.enum(['cut', 'fade']),
  music: z.object({ mediaId: z.string().max(40), url: z.string().regex(/^\/media\/[a-z0-9]+$/), name: z.string().max(200), volume: z.number().min(0).max(1) }).nullable(),
  endCard: z.boolean(),
  voiceName: z.string().refine((v) => VOICES.some((x) => x.id === v)),
  caption: z.string().max(2200).optional(),
})

async function ownedMedia(workspaceId: string, doc: VideoDoc) {
  const ids = [...new Set([...doc.scenes.flatMap((s) => [s.media?.id, s.voiceMediaId]), doc.music?.mediaId].filter((x): x is string => Boolean(x)))]
  if (ids.length === 0) return true
  const n = await prisma.media.count({ where: { id: { in: ids }, workspaceId } })
  return n === ids.length
}

const brandColor = (colors: string[] | undefined) => colors?.find((c) => /^#[0-9a-fA-F]{6}$/.test(c)) ?? '#111827'

export async function createVideo(format: string) {
  const { workspace, brand } = await requireContext()
  const f: Format = isFormat(format) ? format : '9:16'
  const v = await prisma.video.create({
    data: { workspaceId: workspace.id, name: `Untitled ${FORMATS[f].name}`, format: f, data: emptyDoc(brandColor(brand?.colors)) as unknown as Prisma.InputJsonValue },
  })
  revalidatePath('/app/studio')
  return { id: v.id }
}

// A ready-made video: template photos become the workspace's media, scenes
// keep their text and voice-over script (voices are generated in the editor).
export async function createVideoFromTemplate(templateId: string, format: string) {
  const { workspace, brand } = await requireContext()
  const tpl = VIDEO_TEMPLATES.find((t) => t.id === templateId)
  if (!tpl) return { error: 'Unknown template' }
  const f: Format = isFormat(format) ? format : '9:16'
  const photos = await templatePhotos(workspace.id, tpl.scenes.map((s) => `${TEMPLATE_PHOTO}${s.photo}`))
  const bg = brandColor(brand?.colors)
  const doc: VideoDoc = {
    ...emptyDoc(bg),
    transition: tpl.transition,
    caption: tpl.caption,
    scenes: tpl.scenes.map((sc) => {
      const m = photos.get(`${TEMPLATE_PHOTO}${sc.photo}`)
      return newScene(bg, {
        media: m ? { id: m.id, kind: 'image', url: m.url, durationMs: null, posterUrl: null } : null,
        duration: sc.seconds,
        motion: sc.motion,
        text: sc.text,
        voice: sc.voice,
        ...(sc.position && { position: sc.position }),
        ...(sc.style && { style: sc.style }),
      })
    }),
  }
  const v = await prisma.video.create({
    data: { workspaceId: workspace.id, name: tpl.name, format: f, data: doc as unknown as Prisma.InputJsonValue },
  })
  revalidatePath('/app/studio')
  return { id: v.id }
}

export async function saveVideo(id: string, input: { name: string; format: string; doc: VideoDoc }): Promise<{ error?: string }> {
  const { workspace } = await requireContext()
  const parsed = DocSchema.safeParse(input.doc)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  if (!isFormat(input.format)) return { error: 'Unknown format' }
  if (!(await ownedMedia(workspace.id, parsed.data))) return { error: 'Some media are not available' }
  const res = await prisma.video.updateMany({
    where: { id, workspaceId: workspace.id, status: { not: 'RENDERING' } },
    data: { name: input.name.trim().slice(0, 120) || 'Untitled video', format: input.format, data: parsed.data as unknown as Prisma.InputJsonValue },
  })
  if (res.count === 0) return { error: 'This video is rendering — wait until it is done' }
  return {}
}

// Voice-over for every scene whose line has no audio yet. 1 credit per run.
export async function generateVoices(id: string): Promise<{ doc?: VideoDoc; error?: string }> {
  const { account, workspace } = await requireContext()
  const COST = await prices()
  const video = await prisma.video.findFirst({ where: { id, workspaceId: workspace.id } })
  if (!video) return { error: 'Video not found' }
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  const doc = video.data as unknown as VideoDoc
  const todo = doc.scenes.filter((s) => s.voice.trim() && !s.voiceMediaId)
  if (todo.length === 0) return { doc }
  if (account.creditBalance < COST.voice) return { error: notEnough(COST.voice, account.creditBalance) }
  try {
    for (const s of todo) {
      const { wav, ms } = await speak(s.voice.trim(), doc.voiceName)
      const m = await saveMedia(workspace.id, wav, 'audio/wav', `Voice: ${s.voice.slice(0, 100)}`, { durationMs: ms })
      s.voiceMediaId = m.id
      s.voiceMs = ms
    }
  } catch (e) {
    console.error('voice-over failed', e)
    return { error: aiError(e, 'The voice-over could not be generated. Try again.') }
  }
  const ok = await charge(account.id, workspace.id, [{ amount: COST.voice, reason: 'AI_VIDEO', note: 'Video voice-over', action: 'voice', units: 1 }])
  if (!ok) return { error: notEnough(COST.voice, 0) }
  await prisma.video.update({ where: { id }, data: { data: doc as unknown as Prisma.InputJsonValue } })
  revalidatePath('/app', 'layout')
  return { doc }
}

// The browser sends one PNG per part of the timeline (text over each scene,
// then the end card); the server renders in the background.
export async function renderVideo(id: string, overlays: (string | null)[]): Promise<{ error?: string }> {
  const { workspace } = await requireContext()
  const video = await prisma.video.findFirst({ where: { id, workspaceId: workspace.id } })
  if (!video) return { error: 'Video not found' }
  if (video.status === 'RENDERING') return { error: 'Already rendering' }
  const doc = video.data as unknown as VideoDoc
  if (!(await ownedMedia(workspace.id, doc))) return { error: 'Some media are not available' }
  if (doc.scenes.some((s) => s.clipJobId)) return { error: 'An AI clip is still being generated — render when it is ready' }
  const { parts } = timeline(doc)
  if (overlays.length !== parts.length) return { error: 'Save the video and try again' }
  const pngs: (Buffer | null)[] = []
  for (const o of overlays) {
    if (!o) {
      pngs.push(null)
      continue
    }
    const buf = Buffer.from(o, 'base64')
    if (buf.length > 8 * 1024 * 1024 || !buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { error: 'Invalid overlay' }
    pngs.push(buf)
  }
  await prisma.video.update({ where: { id }, data: { status: 'RENDERING', error: null } })
  after(() => enqueueRender(id, pngs))
  revalidatePath('/app/studio')
  return {}
}

export async function videoStatus(id: string) {
  const { workspace } = await requireContext()
  const v = await prisma.video.findFirst({ where: { id, workspaceId: workspace.id }, select: { status: true, error: true, outputMediaId: true } })
  if (!v) return null
  const out = v.outputMediaId ? await prisma.media.findUnique({ where: { id: v.outputMediaId }, select: { id: true, posterId: true, durationMs: true } }) : null
  return { status: v.status, error: v.error, output: out ? { url: mediaUrl(out.id), poster: out.posterId ? mediaUrl(out.posterId) : null } : null }
}

// The rendered MP4 as a new post draft, or into an existing post.
export async function videoToPost(id: string, postId?: string): Promise<{ postId?: string; error?: string }> {
  const { workspace, user } = await requireContext()
  const v = await prisma.video.findFirst({ where: { id, workspaceId: workspace.id } })
  if (!v?.outputMediaId || v.status !== 'READY') return { error: 'Render the video first' }
  const caption = ((v.data as unknown as VideoDoc).caption ?? '').slice(0, 2000)
  if (postId) {
    const post = await prisma.post.findFirst({ where: { id: postId, workspaceId: workspace.id } })
    if (!post) return { error: 'Post not found' }
    if (post.status === 'PUBLISHED' || post.status === 'PUBLISHING') return { error: 'This post is already published' }
    // A post carries one video and nothing else (Instagram Reels rule).
    await prisma.post.update({ where: { id: post.id }, data: { mediaIds: [v.outputMediaId] } })
    return { postId: post.id }
  }
  const post = await prisma.post.create({
    data: { workspaceId: workspace.id, kind: 'SOCIAL', content: caption, mediaIds: [v.outputMediaId], createdById: user.id, channels: ['INSTAGRAM', 'FACEBOOK'] },
  })
  revalidatePath('/app', 'layout')
  return { postId: post.id }
}

export async function deleteVideo(id: string) {
  const { workspace } = await requireContext()
  await prisma.video.deleteMany({ where: { id, workspaceId: workspace.id } })
  revalidatePath('/app/studio')
}

// Photos and clips for scenes; audio for music.
export async function listVideoMedia(kind: 'visual' | 'audio') {
  const { workspace } = await requireContext()
  const rows = await prisma.media.findMany({
    where: { workspaceId: workspace.id, kind: kind === 'audio' ? 'AUDIO' : { in: ['IMAGE', 'VIDEO'] }, NOT: { prompt: { startsWith: 'Voice:' } } },
    orderBy: { createdAt: 'desc' },
    take: 80,
  })
  return rows
    .filter((m) => !(m.prompt?.startsWith('Video poster') || m.prompt?.startsWith('Poster:')))
    .map((m) => ({
      id: m.id,
      kind: m.kind === 'VIDEO' ? ('video' as const) : m.kind === 'AUDIO' ? ('audio' as const) : ('image' as const),
      url: mediaUrl(m.id),
      posterUrl: m.posterId ? mediaUrl(m.posterId) : null,
      durationMs: m.durationMs,
      ...musicName(m.prompt ?? ''),
    }))
}

// Library tracks keep where they came from in the prompt (src/lib/music.ts):
// a short name, and the credit line CC BY tracks need.
function musicName(prompt: string): { name: string; credit?: string | null } {
  const free = prompt.match(/^Music: (.+) — (.+?) · (CC0|Public domain|CC BY[^·]*?)(?: · .*)?$/)
  if (free) return { name: `${free[1]} — ${free[2]}`, credit: free[3].startsWith('CC BY') ? `Music: “${free[1]}” by ${free[2]} (${free[3].trim()})` : null }
  if (prompt.startsWith('Music (AI): ')) return { name: `AI: ${prompt.slice(12)}` }
  return { name: prompt }
}

/* ─── Music: AI (Lyria) and the free library (Openverse) ─────────────── */

type MusicItem = { id: string; kind: 'audio'; url: string; posterUrl: null; durationMs: number | null; name: string; credit?: string | null }

export async function generateTrack(raw: string): Promise<{ item?: MusicItem; error?: string }> {
  const { account, workspace } = await requireContext()
  const COST = await prices()
  const prompt = String(raw ?? '').trim().slice(0, 500)
  if (prompt.length < 3) return { error: 'Describe the music' }
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  if (account.creditBalance < COST.music) return { error: notEnough(COST.music, account.creditBalance) }
  let media
  try {
    const track = await generateMusic(prompt)
    media = await saveGeneratedMusic(workspace.id, track.data, track.mime, prompt)
  } catch (e) {
    console.error('music failed', e)
    return { error: aiError(e, 'The AI could not make this track. Try again or describe it differently.') }
  }
  const ok = await charge(account.id, workspace.id, [{ amount: COST.music, reason: 'AI_VIDEO', note: `AI music: ${prompt.slice(0, 120)}`, action: 'music', units: 1 }])
  if (!ok) {
    await prisma.media.delete({ where: { id: media.id } })
    return { error: notEnough(COST.music, (await prisma.account.findUniqueOrThrow({ where: { id: account.id } })).creditBalance) }
  }
  return { item: { id: media.id, kind: 'audio', url: mediaUrl(media.id), posterUrl: null, durationMs: media.durationMs, name: `AI: ${prompt.slice(0, 80)}` } }
}

export async function findFreeMusic(q: string): Promise<{ tracks?: FreeTrack[]; error?: string }> {
  await requireContext()
  try {
    return { tracks: await searchFreeMusic(String(q ?? '').trim().slice(0, 100)) }
  } catch (e) {
    console.error('free music search failed', e)
    return { error: e instanceof Error && e.message.startsWith('The free library') ? e.message : 'The free library is not reachable right now.' }
  }
}

export async function addFreeMusic(id: string): Promise<{ item?: MusicItem; error?: string }> {
  const { workspace } = await requireContext()
  try {
    const { media, name, credit } = await importFreeMusic(workspace.id, String(id))
    return { item: { id: media.id, kind: 'audio', url: mediaUrl(media.id), posterUrl: null, durationMs: media.durationMs, name, credit } }
  } catch (e) {
    console.error('free music import failed', e)
    return { error: e instanceof Error ? e.message : 'Could not add this track' }
  }
}

/* ─── AI video ───────────────────────────────────────────────────────── */

const AiInput = z.object({
  brief: z.string().trim().min(3, 'Describe the video').max(1500),
  format: z.string(),
  scenes: z.number().int().min(3).max(8),
  visuals: z.enum(['library', 'ai', 'veo', 'none']),
  clipQuality: z.enum(Object.keys(CLIP_QUALITIES) as [ClipQuality, ...ClipQuality[]]).optional(),
  // Veo clips: from a description, by animating the picked photos, or with
  // a character kept the same in every scene.
  veoMode: z.enum(['text', 'photos', 'character']).optional(),
  characterId: z.string().max(40).nullable().optional(),
  mediaIds: z.array(z.string().max(40)).max(20),
  voice: z.boolean(),
  language: z.string(),
  // sketch: hand-drawn whiteboard explainer (ink on paper).
  look: z.enum(['standard', 'sketch']).optional(),
})

// Script → scenes with text and voice lines → visuals (your photos and clips
// in order, AI images, or brand colours) → voice-over. Opens in the editor.
export async function createVideoWithAI(raw: z.input<typeof AiInput>): Promise<{ id?: string; error?: string }> {
  const { account, workspace, brand, user } = await requireContext()
  const COST = await prices()
  const parsed = AiInput.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const input = parsed.data
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  const format: Format = isFormat(input.format) ? input.format : '9:16'
  const language = LANGUAGES.find((l) => l === input.language) ?? 'English'
  const veoMode = input.visuals === 'veo' ? (input.veoMode ?? 'text') : null
  const sketch = input.look === 'sketch'
  // Veo keeps a character only on Pro/Cinema and in 8-second clips.
  const clipQuality: ClipQuality = veoMode === 'character' && (input.clipQuality ?? 'quick') === 'quick' ? 'pro' : (input.clipQuality ?? 'quick')
  const clipSeconds = veoMode === 'character' ? 8 : 4
  const character =
    veoMode === 'character' && input.characterId
      ? await prisma.character.findFirst({ where: { id: input.characterId, workspaceId: workspace.id }, select: { id: true } })
      : null
  if (veoMode === 'character' && !character) return { error: 'Pick a character' }
  const photos =
    veoMode === 'photos'
      ? (await prisma.media.findMany({ where: { id: { in: input.mediaIds }, workspaceId: workspace.id, kind: 'IMAGE' } })).sort(
          (a, b) => input.mediaIds.indexOf(a.id) - input.mediaIds.indexOf(b.id),
        )
      : []
  if (veoMode === 'photos' && photos.length === 0) return { error: 'Pick the photos to animate' }
  const max =
    COST.videoScript +
    (input.voice ? COST.voice : 0) +
    (input.visuals === 'ai' ? input.scenes * COST.image : 0) +
    (input.visuals === 'veo' ? input.scenes * COST[clipAction(clipQuality)] * clipSeconds : 0)
  if (input.visuals === 'veo' && !veoEnabled() && !input.brief.startsWith('[test]')) return { error: 'AI video is not connected yet.' }
  if (input.visuals === 'veo' && !isPaid(account) && user.role !== 'SUPER_ADMIN') return { error: PAID_ONLY }
  if (input.visuals === 'veo' && user.role !== 'SUPER_ADMIN') {
    const allowance = await veoAllowance(account)
    if (allowance.left < input.scenes * clipSeconds) return { error: veoLimitMessage(allowance, input.scenes * clipSeconds) }
  }
  if (account.creditBalance < max) return { error: notEnough(max, account.creditBalance) }

  const known = await withDossier(brand, workspace.id)
  let script
  try {
    script = await videoScript(workspace.name, known, { brief: input.brief, scenes: input.scenes, language, voice: input.voice, look: sketch ? 'sketch' : undefined })
  } catch (e) {
    console.error('videoScript failed', e)
    return { error: aiError(e, 'The AI could not write this video. Try again.') }
  }

  // Your own photos and clips, in the order picked.
  const library = input.visuals === 'library' && input.mediaIds.length
    ? await prisma.media.findMany({ where: { id: { in: input.mediaIds }, workspaceId: workspace.id, kind: { in: ['IMAGE', 'VIDEO'] } } })
    : []
  const ordered = input.mediaIds.map((id) => library.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => Boolean(m))
  const asSceneMedia = (m: (typeof ordered)[number]): SceneMedia => ({
    id: m.id,
    kind: m.kind === 'VIDEO' ? 'video' : 'image',
    url: mediaUrl(m.id),
    durationMs: m.durationMs,
    posterUrl: m.posterId ? mediaUrl(m.posterId) : null,
  })

  let images: (SceneMedia | null)[] = []
  if (input.visuals === 'ai') {
    const aspect = format === '16:9' ? '16:9' : format === '1:1' ? '1:1' : format === '4:5' ? '4:5' : '9:16'
    const res = await Promise.allSettled(
      script.scenes.map((sc, i) =>
        generateImage(workspace.name, known, sc.visual, `${sc.text}. ${sc.voice}`, i, [], aspect, sketch ? IMAGE_STYLES.sketch : undefined).then((img) => saveMedia(workspace.id, img.data, img.mime, sc.visual)),
      ),
    )
    images = res.map((r) => (r.status === 'fulfilled' ? { id: r.value.id, kind: 'image', url: mediaUrl(r.value.id), durationMs: null, posterUrl: null } : null))
    res.forEach((r) => r.status === 'rejected' && console.error('scene image failed', r.reason))
  }

  const bg = sketch ? SKETCH_PAPER : brandColor(brand?.colors)
  const doc: VideoDoc = {
    ...emptyDoc(bg),
    scenes: script.scenes.map((sc, i) =>
      newScene(bg, {
        // Photos being animated show until their clips arrive.
        media: input.visuals === 'ai' ? images[i] : photos.length ? asSceneMedia(photos[i % photos.length]) : ordered.length ? asSceneMedia(ordered[i % ordered.length]) : null,
        duration: sc.seconds,
        text: sc.text,
        voice: sc.voice,
        // White bold text is lost on sketch paper; boxes read on any picture.
        style: i === 0 ? (sketch ? 'box' : 'bold') : 'caption',
        position: i === 0 ? 'center' : 'bottom',
        // Sketches only breathe; pans would cut the drawing off.
        motion: sketch ? (['zoom-in', 'zoom-out'] as const)[i % 2] : (['zoom-in', 'pan-right', 'zoom-out', 'pan-left'] as const)[i % 4],
      }),
    ),
    caption: [script.caption, script.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n'),
  }

  let voiced = false
  if (input.voice) {
    try {
      for (const s of doc.scenes.filter((s) => s.voice)) {
        const { wav, ms } = await speak(s.voice, doc.voiceName)
        const m = await saveMedia(workspace.id, wav, 'audio/wav', `Voice: ${s.voice.slice(0, 100)}`, { durationMs: ms })
        s.voiceMediaId = m.id
        s.voiceMs = ms
      }
      voiced = true
    } catch (e) {
      console.error('voice-over failed', e)
    }
  }

  const drawn = images.filter(Boolean).length
  const ok = await charge(account.id, workspace.id, [
    { amount: COST.videoScript, reason: 'AI_VIDEO', note: 'Video script', action: 'videoScript', units: 1 },
    { amount: voiced ? COST.voice : 0, reason: 'AI_VIDEO', note: 'Video voice-over', action: 'voice', units: 1 },
    { amount: drawn * COST.image, reason: 'AI_IMAGE', note: `${drawn} video scene image${drawn === 1 ? '' : 's'}`, action: 'image', units: drawn },
  ])
  if (!ok) return { error: 'You ran out of credits while this was generating. Choose a plan to get more.' }

  const v = await prisma.video.create({
    data: { workspaceId: workspace.id, name: script.title, format, data: doc as unknown as Prisma.InputJsonValue },
  })

  // Veo clips: one 4-second clip per scene, generated in the background; the
  // editor shows them arriving.
  if (input.visuals === 'veo') {
    const fresh = await prisma.account.findUniqueOrThrow({ where: { id: account.id }, select: { creditBalance: true } })
    let balance = fresh.creditBalance
    for (const [i, sc] of doc.scenes.entries()) {
      const visual = script.scenes[i]?.visual || sc.text
      const prompt =
        veoMode === 'photos'
          ? `Bring this photo to life: ${visual}. Gentle, realistic camera and subject motion; keep the place and people as they are. No text on screen.`
          : sketch
            ? `${visual}. Hand-drawn whiteboard explainer animation: thin black ink lines draw themselves stroke by stroke on plain warm off-white paper, simple doodle characters move a little, one or two small flat colour accents on the key object, static camera. No text on screen.`
            : `${visual}. Vertical social video, no text on screen.`
      const res = await beginClip(account.id, balance, workspace.id, {
        prompt: input.brief.startsWith('[test]') ? `[test] ${prompt}` : prompt,
        quality: clipQuality,
        seconds: clipSeconds,
        format,
        imageId: veoMode === 'photos' ? photos[i % photos.length].id : null,
        videoId: v.id,
        sceneId: sc.id,
        characterId: character?.id ?? null,
      })
      if (res.jobId) {
        sc.clipJobId = res.jobId
        sc.duration = Math.max(sc.duration, clipSeconds)
        balance -= COST[clipAction(clipQuality)] * clipSeconds
      }
    }
    await prisma.video.update({ where: { id: v.id }, data: { data: doc as unknown as Prisma.InputJsonValue } })
  }
  revalidatePath('/app', 'layout')
  return { id: v.id }
}

/* ─── AI clips (Veo) ─────────────────────────────────────────────────── */

const ClipInput = z.object({
  prompt: z.string().trim().min(3, 'Describe the clip').max(1500),
  quality: z.enum(Object.keys(CLIP_QUALITIES) as [ClipQuality, ...ClipQuality[]]),
  seconds: z.number().int().refine((n) => (CLIP_SECONDS as readonly number[]).includes(n), 'Clips are 4, 6 or 8 seconds'),
  format: z.string(),
  imageId: z.string().max(40).nullable(),
  videoId: z.string().max(40).nullable(),
  sceneId: z.string().max(20).nullable(),
  characterId: z.string().max(40).nullable().optional(),
})

// Starts a Veo clip. Credits are taken now and given back if it fails.
export async function startClip(raw: z.input<typeof ClipInput>): Promise<{ jobId?: string; error?: string }> {
  const { account, workspace, user } = await requireContext()
  const parsed = ClipInput.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const c = parsed.data
  if (!veoEnabled() && !c.prompt.startsWith('[test]')) return { error: 'AI video is not connected yet.' }
  if (!isPaid(account) && user.role !== 'SUPER_ADMIN') return { error: PAID_ONLY }
  if (user.role !== 'SUPER_ADMIN') {
    const allowance = await veoAllowance(account)
    if (allowance.left < c.seconds) return { error: veoLimitMessage(allowance, c.seconds) }
  }
  if (c.videoId && !(await prisma.video.findFirst({ where: { id: c.videoId, workspaceId: workspace.id }, select: { id: true } }))) return { error: 'Video not found' }
  if (c.imageId && !(await prisma.media.findFirst({ where: { id: c.imageId, workspaceId: workspace.id, kind: 'IMAGE' }, select: { id: true } }))) return { error: 'Photo not found' }
  if (c.characterId) {
    // Veo keeps a character only on Pro and Cinema, in 8-second clips, and
    // not together with a first-frame photo.
    if (!(await prisma.character.findFirst({ where: { id: c.characterId, workspaceId: workspace.id }, select: { id: true } }))) return { error: 'Character not found' }
    if (c.quality === 'quick') return { error: 'Characters need Pro or Cinema quality' }
    if (c.seconds !== 8) return { error: 'Clips with a character are 8 seconds' }
    if (c.imageId) return { error: 'Use either a character or the scene photo' }
  }
  const res = await beginClip(account.id, account.creditBalance, workspace.id, c)
  if (res.jobId) revalidatePath('/app', 'layout')
  return res
}

async function beginClip(accountId: string, balance: number, workspaceId: string, c: z.output<typeof ClipInput>): Promise<{ jobId?: string; error?: string }> {
  const account = { id: accountId, creditBalance: balance }
  const workspace = { id: workspaceId }
  const credits = (await prices())[clipAction(c.quality)] * c.seconds
  if (account.creditBalance < credits) return { error: notEnough(credits, account.creditBalance) }

  const job = await prisma.clipJob.create({
    data: {
      workspaceId: workspace.id,
      accountId: account.id,
      videoId: c.videoId,
      sceneId: c.sceneId,
      prompt: c.prompt,
      imageId: c.imageId,
      characterId: c.characterId ?? null,
      quality: c.quality,
      aspect: veoAspect(c.format),
      seconds: c.seconds,
      credits,
    },
  })
  const ok = await charge(account.id, workspace.id, [{ amount: credits, reason: 'AI_VIDEO', note: `AI clip · ${CLIP_QUALITIES[c.quality].label} · ${c.seconds}s`, action: clipAction(c.quality), units: c.seconds }])
  if (!ok) {
    await prisma.clipJob.delete({ where: { id: job.id } })
    return { error: notEnough(credits, 0) }
  }
  try {
    const operation = await startVeo(job)
    await prisma.clipJob.update({ where: { id: job.id }, data: { operation } })
  } catch (e) {
    console.error('veo start failed', e)
    const message = e instanceof Error ? e.message : String(e)
    // Not started: hand the credits back right away.
    await prisma.$transaction([
      prisma.account.update({ where: { id: account.id }, data: { creditBalance: { increment: credits } } }),
      prisma.creditEntry.create({
        data: {
          accountId: account.id,
          workspaceId: workspace.id,
          amount: credits,
          reason: 'REFUND',
          note: 'AI clip could not start',
          idempotencyKey: `clip-refund:${job.id}`,
          refType: 'clip',
          refId: job.id,
          action: clipAction(c.quality),
          units: -c.seconds,
        },
      }),
      prisma.clipJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: message.slice(0, 500) } }),
    ])
    return { error: /safety|policy|blocked/i.test(message) ? 'Google refused this description. Try different words.' : aiError(e, 'Veo could not start the clip. Your credits are back.') }
  }
  return { jobId: job.id }
}

// The editor asks every few seconds; each call moves the job forward.
export async function clipStatus(jobId: string) {
  const { workspace } = await requireContext()
  const owned = await prisma.clipJob.findFirst({ where: { id: jobId, workspaceId: workspace.id }, select: { id: true } })
  if (!owned) return null
  const job = await advanceClip(jobId)
  if (!job) return null
  const media = job.mediaId ? await prisma.media.findUnique({ where: { id: job.mediaId }, select: { id: true, durationMs: true, posterId: true } }) : null
  return {
    status: job.status,
    error: job.error,
    media: media ? { id: media.id, kind: 'video' as const, url: mediaUrl(media.id), durationMs: media.durationMs, posterUrl: media.posterId ? mediaUrl(media.posterId) : null } : null,
  }
}
