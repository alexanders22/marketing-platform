import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { TEMPLATE_PHOTO, isTemplatePhoto } from './design'
import { prisma } from './prisma'
import { mediaUrl, saveMedia } from './storage'

const PUBLIC = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'templates')

// Copies the template photos a design or video uses into the workspace's
// media library (once per workspace) and returns ref → media.
export async function templatePhotos(workspaceId: string, ids: string[]) {
  const refs = [...new Set(ids.filter(isTemplatePhoto).map((id) => id.slice(TEMPLATE_PHOTO.length)))]
  const out = new Map<string, { id: string; url: string }>()
  for (const ref of refs) {
    const marker = `Template photo: ${ref}`
    const media =
      (await prisma.media.findFirst({ where: { workspaceId, kind: 'IMAGE', prompt: marker }, select: { id: true } })) ??
      (await saveMedia(workspaceId, await readFile(path.join(PUBLIC, `${ref}.jpg`)), 'image/jpeg', marker))
    out.set(`${TEMPLATE_PHOTO}${ref}`, { id: media.id, url: mediaUrl(media.id) })
  }
  return out
}
