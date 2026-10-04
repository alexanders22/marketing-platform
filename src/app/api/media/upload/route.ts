import { createWriteStream } from 'node:fs'
import { rm, unlink } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { requireContext } from '@/lib/context'
import { posterFrame, probe } from '@/lib/ffmpeg'
import { saveMediaFile, mediaUrl, tempDir } from '@/lib/storage'

// Videos and audio for the Studio and posts, streamed to disk (too big for a
// server action). Body = the raw file; Content-Type = its type.
const TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg']
const MAX_BYTES = 200 * 1024 * 1024
const MAX_SECONDS = 180

const fail = (status: number, error: string) => Response.json({ error }, { status })

export async function POST(req: Request) {
  const { workspace } = await requireContext()
  // Browsers name the same formats differently.
  const ALIAS: Record<string, string> = { 'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4', 'audio/aac': 'audio/mp4', 'audio/mp3': 'audio/mpeg', 'audio/vnd.wave': 'audio/wav' }
  const raw = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const mime = ALIAS[raw] ?? raw
  if (!TYPES.includes(mime)) return fail(415, 'Upload MP4, MOV or WebM videos, or MP3, M4A, WAV or OGG audio')
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) return fail(413, 'Files can be up to 200 MB')
  if (!req.body) return fail(400, 'Empty upload')

  const dir = await tempDir('upload')
  const file = path.join(dir, 'in')
  try {
    let bytes = 0
    const limited = Readable.fromWeb(req.body as import('node:stream/web').ReadableStream).on('data', (c: Buffer) => {
      bytes += c.length
      if (bytes > MAX_BYTES) limited.destroy(new Error('too big'))
    })
    try {
      await pipeline(limited, createWriteStream(file))
    } catch {
      return fail(413, 'Files can be up to 200 MB')
    }
    if (bytes === 0) return fail(400, 'Empty upload')

    // Trust what ffmpeg reads, not the declared type.
    const info = await probe(file)
    const video = mime.startsWith('video/')
    if (video ? !info.video : !info.audio) return fail(415, video ? 'This file has no video in it' : 'This file has no audio in it')
    if (!info.durationMs) return fail(415, 'Could not read this file')
    if (info.durationMs > MAX_SECONDS * 1000) return fail(413, `Up to ${MAX_SECONDS / 60} minutes per file`)

    let posterId: string | undefined
    if (video) {
      const still = path.join(dir, 'poster.jpg')
      await posterFrame(file, still, Math.min(1, info.durationMs / 2000))
      posterId = (await saveMediaFile(workspace.id, still, 'image/jpeg', 'Video poster')).id
    }
    const name = (new URL(req.url).searchParams.get('name') ?? '').slice(0, 200) || undefined
    const media = await saveMediaFile(workspace.id, file, mime, name, {
      durationMs: info.durationMs,
      width: info.width ?? undefined,
      height: info.height ?? undefined,
      posterId,
    })
    return Response.json({
      id: media.id,
      url: mediaUrl(media.id),
      kind: media.kind,
      durationMs: media.durationMs,
      width: media.width,
      height: media.height,
      posterUrl: posterId ? mediaUrl(posterId) : null,
    })
  } finally {
    await unlink(file).catch(() => {})
    await rm(dir, { recursive: true, force: true })
  }
}
