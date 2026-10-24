import 'server-only'
import type { Part } from '@google/genai'
import type { Prisma } from '@prisma/client'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'node-html-parser'
import { analyzeImageStyle, analyzeVideoStyle, videoForAI, type ImageLook, type VideoLook } from './ai'
import { imageTooBig, MAX_IMAGE_SIDE, posterFrame, sniffType } from './ffmpeg'
import { IMAGE_STYLES, isRefStyle, type ImageStyle, type ImageStyleDef } from './image-styles'
import { prisma } from './prisma'
import { safeFetchBytes } from './safe-fetch'
import { mediaFile, mediaUrl, readMedia, saveMedia, tempDir } from './storage'

// "Make it like this": a reference image or video — a link or a file from the
// library — is read by the AI into a reusable look (StyleRef). Image looks go
// to the image model with the reference still; video looks also carry the
// structure for AI videos.

export class RefError extends Error {}

export type StyleKind = 'IMAGE' | 'VIDEO'
export type StyleView = {
  id: string
  kind: StyleKind
  name: string
  summary: string
  palette: string[]
  thumbUrl: string | null
  sourceUrl: string | null
  // Video styles: scenes, whether someone speaks, the music mood.
  beats: number | null
  voice: boolean
  music: string | null
}

// These networks only show videos to signed-in people: the owner downloads
// the video and uploads the file instead.
const CLOSED = /(^|\.)(instagram\.com|tiktok\.com|facebook\.com|fb\.watch|threads\.net|x\.com|twitter\.com|linkedin\.com|pinterest\.[a-z.]+|pin\.it)$/i
const CLOSED_MESSAGE = 'This network only shows its videos and pictures to signed-in people, so Loudpilot can’t read the link. Save it to your phone or computer and upload the file here.'
const MAX_VIDEO = 100_000_000
const MAX_IMAGE = 10_000_000
const THUMB = 'Style reference:'

function youtubeId(u: URL) {
  const host = u.hostname.replace(/^(www\.|m\.)/, '')
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
  if (host !== 'youtube.com' && host !== 'music.youtube.com') return null
  const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)
  return m?.[1] ?? u.searchParams.get('v')
}

type Loaded = { part: Part; still: { data: Buffer; mime: string } | null; done: () => Promise<void> }

const inline = (data: Buffer, mime: string): Part => ({ inlineData: { mimeType: mime, data: data.toString('base64') } })
const noop = async () => {}

async function videoFile(file: string, mime: string): Promise<Loaded> {
  const dir = await tempDir('style')
  try {
    const still = path.join(dir, 'still.jpg')
    await posterFrame(file, mime, still, 1).catch(() => null)
    const stillData = await readFile(still).catch(() => null)
    const { part, done } = await videoForAI(file, mime)
    return { part, still: stillData ? { data: stillData, mime: 'image/jpeg' } : null, done }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function fromMedia(workspaceId: string, mediaId: string, want: StyleKind): Promise<Loaded> {
  const m = await prisma.media.findFirst({ where: { id: mediaId, workspaceId } })
  if (!m) throw new RefError('File not found')
  if (want === 'IMAGE' && m.kind !== 'IMAGE') throw new RefError('Pick a picture')
  if (want === 'VIDEO' && m.kind !== 'VIDEO') throw new RefError('Pick a video')
  if (m.kind === 'IMAGE') {
    const data = await readMedia(m.path)
    return { part: inline(data, m.mime), still: { data, mime: m.mime }, done: noop }
  }
  return videoFile(mediaFile(m.path), m.mime)
}

// og:video / og:image of a web page.
function metaUrl(html: string, base: string, want: StyleKind) {
  const root = parse(html)
  const pick = (...names: string[]) => {
    for (const n of names) {
      const v = root.querySelector(`meta[property="${n}"]`)?.getAttribute('content') ?? root.querySelector(`meta[name="${n}"]`)?.getAttribute('content')
      if (v) return new URL(v, base).toString()
    }
    return null
  }
  return want === 'VIDEO' ? pick('og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream') : pick('og:image:secure_url', 'og:image', 'twitter:image')
}

async function fromUrl(raw: string, want: StyleKind): Promise<Loaded> {
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`)
  } catch {
    throw new RefError('That doesn’t look like a link')
  }
  if (CLOSED.test(url.hostname)) throw new RefError(CLOSED_MESSAGE)

  // YouTube: the model watches it directly; the still is its thumbnail.
  const yt = youtubeId(url)
  if (yt) {
    const thumb = await safeFetchBytes(`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`, { maxBytes: 2_000_000, timeoutMs: 10_000, accept: 'image/*' }).catch(() => null)
    const thumbType = thumb ? sniffType(thumb.bytes, 'image') : null
    const still = thumb && thumbType && !imageTooBig(thumb.bytes) ? { data: thumb.bytes, mime: thumbType } : null
    if (want === 'IMAGE') {
      if (!still) throw new RefError('Could not get a picture from that video')
      return { part: inline(still.data, still.mime), still, done: noop }
    }
    return { part: { fileData: { fileUri: `https://www.youtube.com/watch?v=${yt}` } }, still, done: noop }
  }

  const max = want === 'VIDEO' ? MAX_VIDEO : MAX_IMAGE
  const get = async (u: string) => {
    const r = await safeFetchBytes(u, { maxBytes: max, timeoutMs: 60_000, accept: want === 'VIDEO' ? 'video/*,text/html,*/*' : 'image/*,text/html,*/*' }).catch(() => {
      throw new RefError('Could not open that link')
    })
    // safeFetchBytes stops at the limit: a cut file is no use.
    if (r.bytes.length >= max) throw new RefError(want === 'VIDEO' ? 'That video is too big — upload a shorter one' : 'That picture is too big')
    return r
  }
  // The type comes from the bytes; Content-Type only tells a page from a file.
  const kind = want === 'VIDEO' ? 'video' : 'image'
  let res = await get(url.toString())
  let type = sniffType(res.bytes, kind)
  const declared = res.contentType?.split(';')[0].trim().toLowerCase() ?? ''
  if (!type && (declared === 'text/html' || declared === 'application/xhtml+xml')) {
    const inner = metaUrl(res.bytes.toString('utf8'), res.url, want)
    if (!inner) throw new RefError(want === 'VIDEO' ? 'No video found on that page — upload the file instead.' : 'No picture found on that page — upload it instead.')
    res = await get(inner)
    type = sniffType(res.bytes, kind)
  }
  if (want === 'IMAGE') {
    if (!type) throw new RefError('That link is not a picture')
    if (imageTooBig(res.bytes)) throw new RefError(`That picture is too big — up to ${MAX_IMAGE_SIDE} pixels on a side`)
    return { part: inline(res.bytes, type), still: { data: res.bytes, mime: type }, done: noop }
  }
  if (!type) throw new RefError('That link is not a video file')
  const dir = await tempDir('style')
  const file = path.join(dir, `ref.${type === 'video/webm' ? 'webm' : type === 'video/quicktime' ? 'mov' : 'mp4'}`)
  await writeFile(file, res.bytes)
  try {
    return await videoFile(file, type)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const view = (r: { id: string; kind: string; name: string; sourceUrl: string | null; thumbId: string | null; data: Prisma.JsonValue }): StyleView => {
  const d = r.data as unknown as Partial<VideoLook>
  return {
    id: r.id,
    kind: r.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE',
    name: r.name,
    summary: d.summary ?? '',
    palette: d.palette ?? [],
    thumbUrl: r.thumbId ? mediaUrl(r.thumbId) : null,
    sourceUrl: r.sourceUrl,
    beats: Array.isArray(d.beats) ? d.beats.length : null,
    voice: d.voice?.used === true,
    music: d.music?.used ? d.music.mood || 'music' : null,
  }
}

// Reads the reference and saves its look. Throws RefError with a message
// for the owner when the reference can't be used.
export async function copyStyle(workspaceId: string, want: StyleKind, src: { url?: string; mediaId?: string }): Promise<StyleView> {
  const loaded = src.mediaId ? await fromMedia(workspaceId, src.mediaId, want) : src.url ? await fromUrl(src.url, want) : null
  if (!loaded) throw new RefError('Add a link or a file')
  let look: ImageLook | VideoLook
  try {
    look = want === 'VIDEO' ? await analyzeVideoStyle(loaded.part) : await analyzeImageStyle(loaded.part)
  } finally {
    await loaded.done()
  }
  const thumb = loaded.still ? await saveMedia(workspaceId, loaded.still.data, loaded.still.mime === 'image/jpg' ? 'image/jpeg' : loaded.still.mime, `${THUMB} ${look.name}`) : null
  const row = await prisma.styleRef.create({
    data: { workspaceId, kind: want, name: look.name, sourceUrl: src.mediaId ? null : (src.url ?? null), thumbId: thumb?.id ?? null, data: look as unknown as Prisma.InputJsonValue },
  })
  return view(row)
}

export async function listStyles(workspaceId: string, kind?: StyleKind) {
  const rows = await prisma.styleRef.findMany({ where: { workspaceId, ...(kind ? { kind } : {}) }, orderBy: { createdAt: 'desc' }, take: 40 })
  return rows.map(view)
}

export async function videoLook(workspaceId: string, id: string) {
  const r = await prisma.styleRef.findFirst({ where: { id, workspaceId, kind: 'VIDEO' } })
  return r ? { ...(r.data as unknown as VideoLook), thumbId: r.thumbId } : null
}

// A built-in style id, or "ref:<id>" for a copied one (its still goes along
// as the style reference picture).
export async function resolveImageStyle(workspaceId: string, id: string | null | undefined): Promise<ImageStyleDef | undefined> {
  if (!id) return undefined
  if (!isRefStyle(id)) return id in IMAGE_STYLES ? IMAGE_STYLES[id as ImageStyle] : undefined
  const r = await prisma.styleRef.findFirst({ where: { id: id.slice(4), workspaceId } })
  if (!r) return undefined
  const d = r.data as unknown as ImageLook
  const still = r.thumbId ? await prisma.media.findFirst({ where: { id: r.thumbId, workspaceId } }) : null
  const data = still ? await readMedia(still.path).catch(() => null) : null
  return {
    label: r.name,
    prompt: `in this exact visual style: ${d.prompt}${d.palette.length ? ` Palette: ${d.palette.join(', ')}.` : ''}`,
    ownPalette: true,
    ...(still && data ? { reference: { mime: still.mime, data: data.toString('base64') } } : {}),
  }
}

export const isStyleThumb = (prompt: string | null) => Boolean(prompt?.startsWith(THUMB))
