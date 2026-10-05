import 'server-only'
import { writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { GoogleGenAI, GenerateVideosOperation } from '@google/genai'
import type { ClipJob } from '@prisma/client'
import { ffmpeg, posterFrame, probe } from './ffmpeg'
import { ACTIVE_WORKSPACE } from './pause'
import { prisma } from './prisma'
import { mediaFile, saveMediaFile, tempDir } from './storage'
import { clipAction } from './pricing'
import type { ClipQuality } from './video'

// AI video clips with Google Veo 3.1 (Gemini API). Generation is a
// long-running operation: start it, then poll (the ticker and the editor
// both do) until the MP4 is ready to download into the media library.

export { CLIP_QUALITIES, CLIP_SECONDS, clipCredits, type ClipQuality } from './video'

const MODELS: Record<ClipQuality, string> = {
  quick: 'veo-3.1-lite-generate-preview',
  pro: 'veo-3.1-fast-generate-preview',
  cinema: 'veo-3.1-generate-preview',
}

const key = process.env.GEMINI_API_KEY
const client = key ? new GoogleGenAI({ apiKey: key }) : null
export const veoEnabled = () => client !== null

// Veo makes 9:16 or 16:9; the renderer crops to 4:5 and 1:1.
export const veoAspect = (format: string) => (format === '16:9' ? '16:9' : '9:16')

// Local test clips: a prompt starting with "[test]" never reaches Google
// outside production — it renders a coloured clip after a short wait.
const isTest = (prompt: string) => process.env.NODE_ENV !== 'production' && prompt.startsWith('[test]')

export async function startVeo(job: Pick<ClipJob, 'prompt' | 'quality' | 'aspect' | 'seconds' | 'imageId' | 'workspaceId'>): Promise<string> {
  if (isTest(job.prompt)) return `test:${Date.now()}:${job.prompt.includes('fail') ? 'fail' : 'ok'}`
  if (!client) throw new Error('AI video is not configured')
  const model = MODELS[job.quality as ClipQuality] ?? MODELS.quick
  let image: { imageBytes: string; mimeType: string } | undefined
  if (job.imageId) {
    const m = await prisma.media.findFirst({ where: { id: job.imageId, workspaceId: job.workspaceId, kind: 'IMAGE' } })
    if (!m) throw new Error('The photo is not available')
    const { readFile } = await import('node:fs/promises')
    image = { imageBytes: (await readFile(mediaFile(m.path))).toString('base64'), mimeType: m.mime === 'image/png' ? 'image/png' : 'image/jpeg' }
  }
  const op = await client.models.generateVideos({
    model,
    // Not every Veo model takes a negative prompt: say it in the prompt.
    source: { prompt: `${job.prompt}\nNo on-screen text, captions, logos or watermarks.`, ...(image ? { image } : {}) },
    config: { aspectRatio: job.aspect, durationSeconds: job.seconds, numberOfVideos: 1 },
  })
  if (!op.name) throw new Error('Veo did not start the clip')
  return op.name
}

type Outcome = { done: false } | { done: true; error: string } | { done: true; file: string; dir: string }

async function checkOperation(job: ClipJob): Promise<Outcome> {
  const name = job.operation!
  if (name.startsWith('test:')) {
    const [, at, mode] = name.split(':')
    if (Date.now() - Number(at) < 3000) return { done: false }
    if (mode === 'fail') return { done: true, error: 'The clip was blocked by safety filters. Try a different description.' }
    const dir = await tempDir('veo')
    const file = path.join(dir, 'clip.mp4')
    const size = job.aspect === '16:9' ? '1280x720' : '720x1280'
    await ffmpeg(['-y', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=24:duration=${job.seconds}`, '-f', 'lavfi', '-i', `sine=frequency=330:duration=${job.seconds}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file])
    return { done: true, file, dir }
  }
  if (!client) return { done: true, error: 'AI video is not configured' }
  const op = new GenerateVideosOperation()
  op.name = name
  const res = await client.operations.getVideosOperation({ operation: op })
  if (!res.done) return { done: false }
  if (res.error) return { done: true, error: String((res.error as { message?: string }).message ?? 'Veo failed').slice(0, 500) }
  const video = res.response?.generatedVideos?.[0]?.video
  if (!video?.uri && !video?.videoBytes) {
    const blocked = res.response?.raiMediaFilteredReasons?.[0]
    return { done: true, error: blocked ? `Blocked by safety filters: ${blocked}`.slice(0, 500) : 'Veo returned no video. Try a different description.' }
  }
  const dir = await tempDir('veo')
  const file = path.join(dir, 'clip.mp4')
  if (video.videoBytes) await writeFile(file, Buffer.from(video.videoBytes, 'base64'))
  else {
    const r = await fetch(video.uri!, { headers: { 'x-goog-api-key': key! }, signal: AbortSignal.timeout(120_000) })
    if (!r.ok) {
      await rm(dir, { recursive: true, force: true })
      return { done: false } // try the download again on the next check
    }
    await writeFile(file, Buffer.from(await r.arrayBuffer()))
  }
  return { done: true, file, dir }
}

// Credits back, once, when a clip fails.
async function refund(job: ClipJob, reason: string) {
  const idempotencyKey = `clip-refund:${job.id}`
  await prisma.$transaction(async (tx) => {
    if (await tx.creditEntry.findUnique({ where: { idempotencyKey }, select: { id: true } })) return
    await tx.account.update({ where: { id: job.accountId }, data: { creditBalance: { increment: job.credits } } })
    await tx.creditEntry.create({
      // Same action, negative units: unit economics count only clips that were made.
      data: {
        accountId: job.accountId,
        workspaceId: job.workspaceId,
        amount: job.credits,
        reason: 'REFUND',
        note: `AI clip failed: ${reason}`.slice(0, 200),
        idempotencyKey,
        refType: 'clip',
        refId: job.id,
        action: clipAction(job.quality as ClipQuality),
        units: -job.seconds,
      },
    })
  })
}

const TIMEOUT_MS = 20 * 60_000

// One look at a pending job; finishes it when Veo is done.
export async function advanceClip(jobId: string) {
  const job = await prisma.clipJob.findUnique({ where: { id: jobId } })
  if (!job || job.status !== 'PENDING' || !job.operation) return job
  let outcome: Outcome
  try {
    outcome = await checkOperation(job)
  } catch (e) {
    console.error('veo check failed', job.id, e)
    outcome = { done: false }
  }
  if (!outcome.done) {
    if (Date.now() - job.createdAt.getTime() < TIMEOUT_MS) {
      await prisma.clipJob.update({ where: { id: job.id }, data: { updatedAt: new Date() } })
      return job
    }
    outcome = { done: true, error: 'Veo took too long. Your credits are back — try again.' }
  }
  // Claim: only one checker finishes the job.
  const claim = await prisma.clipJob.updateMany({ where: { id: job.id, status: 'PENDING' }, data: { status: 'DONE' } })
  if (claim.count === 0) {
    if ('dir' in outcome) await rm(outcome.dir, { recursive: true, force: true })
    return prisma.clipJob.findUnique({ where: { id: job.id } })
  }
  if ('error' in outcome) {
    await refund(job, outcome.error)
    return prisma.clipJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: outcome.error } })
  }
  try {
    const info = await probe(outcome.file)
    const poster = path.join(outcome.dir, 'poster.jpg')
    await posterFrame(outcome.file, poster, 0.5)
    const posterMedia = await saveMediaFile(job.workspaceId, poster, 'image/jpeg', 'Video poster')
    const media = await saveMediaFile(job.workspaceId, outcome.file, 'video/mp4', `AI clip: ${job.prompt.slice(0, 300)}`, {
      durationMs: info.durationMs ?? job.seconds * 1000,
      width: info.width ?? undefined,
      height: info.height ?? undefined,
      posterId: posterMedia.id,
    })
    await attachToScene(job, media.id, media.durationMs, posterMedia.id)
    return prisma.clipJob.update({ where: { id: job.id }, data: { mediaId: media.id, error: null } })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await refund(job, message)
    return prisma.clipJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: message.slice(0, 500) } })
  } finally {
    await rm(outcome.dir, { recursive: true, force: true })
  }
}

// The scene that asked for the clip gets it — unless someone picked other
// media for it meanwhile.
async function attachToScene(job: ClipJob, mediaId: string, durationMs: number | null, posterId: string) {
  if (!job.videoId || !job.sceneId) return
  const video = await prisma.video.findFirst({ where: { id: job.videoId, workspaceId: job.workspaceId } })
  if (!video || video.status === 'RENDERING') return
  const doc = video.data as { scenes: { id: string; clipJobId?: string | null; media: unknown; keepAudio?: boolean; clipStart: number }[] }
  const scene = doc.scenes.find((s) => s.id === job.sceneId && s.clipJobId === job.id)
  if (!scene) return
  scene.media = { id: mediaId, kind: 'video', url: `/media/${mediaId}`, durationMs, posterUrl: `/media/${posterId}` }
  scene.clipJobId = null
  scene.clipStart = 0
  await prisma.video.update({ where: { id: video.id }, data: { data: doc as object } })
}

// Ticker: pending clips checked every ~20 seconds.
export async function advanceClipsDue(now = new Date()) {
  const due = await prisma.clipJob.findMany({
    where: { status: 'PENDING', operation: { not: null }, updatedAt: { lt: new Date(now.getTime() - 20_000) }, workspace: ACTIVE_WORKSPACE },
    orderBy: { updatedAt: 'asc' },
    take: 10,
    select: { id: true },
  })
  for (const j of due) await advanceClip(j.id).catch((e) => console.error('clip advance failed', j.id, e))
  return due.length
}

// Re-encode a clip's own sound check: whether the file has audio at all.
export async function hasAudio(rel: string) {
  return (await probe(mediaFile(rel))).audio
}
