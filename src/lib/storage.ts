import 'server-only'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { prisma } from './prisma'

// Files live under STORAGE_DIR (default ./storage, git-ignored), one folder
// per workspace. Served only through /media/[id], which checks access.
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR || 'storage')
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
}

const kindOf = (mime: string) => (mime.startsWith('video/') ? 'VIDEO' : mime.startsWith('audio/') ? 'AUDIO' : 'IMAGE') as 'IMAGE' | 'VIDEO' | 'AUDIO'

type Extra = { width?: number; height?: number; durationMs?: number; posterId?: string }

const newRel = (workspaceId: string, mime: string) => path.join(workspaceId, `${Date.now()}-${randomBytes(6).toString('hex')}.${EXT[mime] ?? 'bin'}`)

export async function saveMedia(workspaceId: string, data: Buffer, mime: string, prompt?: string, extra: Extra = {}) {
  const rel = newRel(workspaceId, mime)
  await mkdir(path.join(/*turbopackIgnore: true*/ ROOT, workspaceId), { recursive: true })
  await writeFile(path.join(/*turbopackIgnore: true*/ ROOT, rel), data)
  return prisma.media.create({
    data: { workspaceId, kind: kindOf(mime), mime, path: rel, bytes: data.length, prompt: prompt?.slice(0, 2000), ...extra },
  })
}

// Large files (videos, audio) arrive on disk already: move them in.
export async function saveMediaFile(workspaceId: string, file: string, mime: string, prompt?: string, extra: Extra = {}) {
  const rel = newRel(workspaceId, mime)
  await mkdir(path.join(/*turbopackIgnore: true*/ ROOT, workspaceId), { recursive: true })
  const dest = path.join(/*turbopackIgnore: true*/ ROOT, rel)
  await rename(file, dest)
  const { size } = await stat(dest)
  return prisma.media.create({
    data: { workspaceId, kind: kindOf(mime), mime, path: rel, bytes: size, prompt: prompt?.slice(0, 2000), ...extra },
  })
}

// Absolute path of a stored file (ffmpeg reads files directly).
export function mediaFile(rel: string) {
  const full = path.resolve(ROOT, rel)
  if (!full.startsWith(ROOT + path.sep)) throw new Error('Bad media path')
  return full
}

// Where jpegCopy keeps the JPEG version of a PNG/WebP image.
export const jpegCopyPath = (file: string) => `${file.replace(/\.[^./]+$/, '')}.jpeg.jpg`

// Deletes Media rows and their files (and any JPEG copy). Every row has its
// own file; one that another row still names is kept all the same.
export async function deleteMedia(ids: string[]) {
  if (!ids.length) return
  const rows = await prisma.media.findMany({ where: { id: { in: ids } }, select: { id: true, path: true } })
  await prisma.media.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })
  await removeMediaFiles(rows.map((r) => r.path))
}

async function removeMediaFiles(paths: string[]) {
  const kept = new Set((await prisma.media.findMany({ where: { path: { in: paths } }, select: { path: true } })).map((r) => r.path))
  for (const rel of paths) {
    if (kept.has(rel)) continue
    try {
      const file = mediaFile(rel)
      await rm(file, { force: true })
      await rm(jpegCopyPath(file), { force: true })
    } catch (e) {
      console.error('media file not removed', rel, e instanceof Error ? e.message : e)
    }
  }
}

// After a workspace is deleted: its whole folder.
export async function removeWorkspaceFiles(workspaceId: string) {
  const dir = path.resolve(ROOT, workspaceId)
  if (!/^[\w-]+$/.test(workspaceId) || path.dirname(dir) !== ROOT) throw new Error('Bad workspace id')
  await rm(/*turbopackIgnore: true*/ dir, { recursive: true, force: true })
}

// Scratch space on the same disk as storage, so moves are renames.
export async function tempDir(name: string) {
  const dir = path.join(/*turbopackIgnore: true*/ ROOT, '.tmp', `${name}-${Date.now()}-${randomBytes(4).toString('hex')}`)
  await mkdir(dir, { recursive: true })
  return dir
}

// Where a queued render keeps the files it needs until it runs (so a server
// restart does not lose them). One folder per job.
export function renderJobDir(job: string) {
  if (!/^[a-z0-9-]+$/i.test(job)) throw new Error('Bad job id')
  return path.join(/*turbopackIgnore: true*/ ROOT, '.render-jobs', job)
}

export async function readMedia(rel: string) {
  const full = path.resolve(ROOT, rel)
  if (!full.startsWith(ROOT + path.sep)) throw new Error('Bad media path')
  // Runtime data dir, not source — keep it out of build tracing.
  return readFile(/*turbopackIgnore: true*/ full)
}

export const mediaUrl = (id: string) => `/media/${id}`
