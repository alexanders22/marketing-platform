'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { mediaUrl, saveMedia } from '@/lib/storage'

const NETWORKS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'TELEGRAM', 'X', 'THREADS', 'PINTEREST'] as const

const PostInput = z.object({
  id: z.string().optional(),
  kind: z.enum(['SOCIAL', 'BLOG']),
  title: z.string().trim().max(200).optional(),
  content: z.string().max(60_000),
  hashtags: z.array(z.string().trim().regex(/^[\p{L}\p{N}_]{1,60}$/u, 'Hashtags: letters, digits and _ only')).max(30),
  mediaIds: z.array(z.string()).max(10),
  channels: z.array(z.enum(NETWORKS)).max(NETWORKS.length),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  aiGenerated: z.boolean().optional(),
})

export type PostInput = z.input<typeof PostInput>

export async function savePost(raw: PostInput): Promise<{ id?: string; error?: string }> {
  const { workspace, user } = await requireContext()
  const parsed = PostInput.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const p = parsed.data
  if (p.kind === 'SOCIAL' && !p.content.trim() && p.mediaIds.length === 0) return { error: 'Write something or add an image' }
  if (p.kind === 'BLOG' && !p.title) return { error: 'Give the article a title' }

  // Only this workspace's media can be attached.
  const owned = await prisma.media.count({ where: { id: { in: p.mediaIds }, workspaceId: workspace.id } })
  if (owned !== p.mediaIds.length) return { error: 'Some images are not available' }

  const data = {
    kind: p.kind,
    title: p.title || null,
    content: p.content,
    hashtags: [...new Set(p.hashtags)],
    mediaIds: p.mediaIds,
    channels: p.channels,
    scheduledAt: p.scheduledAt ? new Date(p.scheduledAt) : null,
  }

  let id = p.id
  if (id) {
    const res = await prisma.post.updateMany({ where: { id, workspaceId: workspace.id }, data })
    if (res.count === 0) return { error: 'Post not found' }
  } else {
    const created = await prisma.post.create({
      data: { ...data, workspaceId: workspace.id, createdById: user.id, aiGenerated: p.aiGenerated ?? false },
    })
    id = created.id
  }
  revalidatePath('/app', 'layout')
  return { id }
}

export async function deletePost(id: string) {
  const { workspace } = await requireContext()
  await prisma.post.deleteMany({ where: { id, workspaceId: workspace.id } })
  revalidatePath('/app', 'layout')
  return {}
}

// ─── Media ─────────────────────────────────────────────────────────────────

const MAX_BYTES = 6 * 1024 * 1024

// Trust the bytes, not the declared type.
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  return null
}

export async function uploadMedia(input: { data: string; prompt?: string }): Promise<{ id?: string; url?: string; error?: string }> {
  const { workspace } = await requireContext()
  const buf = Buffer.from(input.data, 'base64')
  if (buf.length === 0 || buf.length > MAX_BYTES) return { error: 'Images must be under 6 MB' }
  const mime = sniff(buf)
  if (!mime) return { error: 'Only PNG, JPG and WebP images are supported' }
  const media = await saveMedia(workspace.id, buf, mime, input.prompt)
  return { id: media.id, url: mediaUrl(media.id) }
}

export async function listMedia(): Promise<{ id: string; url: string }[]> {
  const { workspace } = await requireContext()
  const rows = await prisma.media.findMany({
    where: { workspaceId: workspace.id, kind: 'IMAGE' },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { id: true },
  })
  return rows.map((m) => ({ id: m.id, url: mediaUrl(m.id) }))
}
