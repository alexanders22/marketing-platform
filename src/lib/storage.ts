import 'server-only'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { prisma } from './prisma'

// Files live under STORAGE_DIR (default ./storage, git-ignored), one folder
// per workspace. Served only through /media/[id], which checks access.
const ROOT = path.resolve(process.env.STORAGE_DIR || 'storage')
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export async function saveMedia(workspaceId: string, data: Buffer, mime: string, prompt?: string) {
  const ext = EXT[mime] ?? 'bin'
  const rel = path.join(workspaceId, `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`)
  await mkdir(path.join(ROOT, workspaceId), { recursive: true })
  await writeFile(path.join(ROOT, rel), data)
  return prisma.media.create({
    data: { workspaceId, mime, path: rel, bytes: data.length, prompt: prompt?.slice(0, 2000) },
  })
}

export async function readMedia(rel: string) {
  const full = path.resolve(ROOT, rel)
  if (!full.startsWith(ROOT + path.sep)) throw new Error('Bad media path')
  return readFile(full)
}

export const mediaUrl = (id: string) => `/media/${id}`
