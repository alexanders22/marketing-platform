'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { publishPostNow, targetsFor } from '@/lib/publisher'
import { aiEnabled, generateImage } from '@/lib/ai'
import { charge, notEnough, prices } from '@/lib/credits'
import { withDossier } from '@/lib/dossier'
import { mediaUrl, saveMedia } from '@/lib/storage'

const NETWORKS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'TELEGRAM', 'X', 'THREADS', 'PINTEREST'] as const

const PostInput = z.object({
  id: z.string().optional(),
  kind: z.enum(['SOCIAL', 'BLOG']),
  title: z.string().trim().max(200).optional(),
  content: z.string().max(60_000),
  // Hashtags for social posts, SEO keywords (may contain spaces) for articles —
  // validated per kind below.
  hashtags: z.array(z.string().trim().min(1).max(80)).max(30, 'Up to 30 hashtags or keywords'),
  mediaIds: z.array(z.string()).max(10),
  channels: z.array(z.enum(NETWORKS)).max(NETWORKS.length),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  aiGenerated: z.boolean().optional(),
  // true = publish automatically at scheduledAt; otherwise the post is a
  // draft that only sits in the Planner.
  schedule: z.boolean().optional(),
  // Saved on the way to the Studio: an empty draft is fine then.
  allowEmpty: z.boolean().optional(),
})

export type PostInput = z.input<typeof PostInput>

export async function savePost(raw: PostInput): Promise<{ id?: string; error?: string }> {
  const { workspace, user } = await requireContext()
  const parsed = PostInput.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const p = parsed.data
  if (p.kind === 'SOCIAL' && !p.content.trim() && p.mediaIds.length === 0 && !p.allowEmpty) return { error: 'Write something or add an image' }
  if (p.kind === 'BLOG' && !p.title) return { error: 'Give the article a title' }
  if (p.kind === 'SOCIAL' && p.hashtags.some((h) => !/^[\p{L}\p{N}_]{1,60}$/u.test(h))) {
    return { error: 'Hashtags can only contain letters, digits and _' }
  }

  // Only this workspace's media can be attached.
  const owned = await prisma.media.findMany({ where: { id: { in: p.mediaIds }, workspaceId: workspace.id }, select: { kind: true } })
  if (owned.length !== new Set(p.mediaIds).size) return { error: 'Some images are not available' }
  if (owned.some((m) => m.kind === 'AUDIO')) return { error: 'Audio can not be posted on its own' }
  if (owned.some((m) => m.kind === 'VIDEO') && p.mediaIds.length > 1) return { error: 'A post can have one video or several images — not both' }

  const existing = p.id
    ? await prisma.post.findFirst({ where: { id: p.id, workspaceId: workspace.id }, select: { status: true } })
    : null
  if (p.id && !existing) return { error: 'Post not found' }
  if (existing?.status === 'PUBLISHING') return { error: 'This post is being published right now' }
  const published = existing?.status === 'PUBLISHED'
  if (p.schedule) {
    if (p.kind !== 'SOCIAL') return { error: 'Only social posts can be scheduled' }
    if (published) return { error: 'This post is already published' }
    if (!p.scheduledAt) return { error: 'Pick a date and time to schedule' }
    if (new Date(p.scheduledAt).getTime() < Date.now() - 60_000) return { error: 'Pick a time in the future — or publish now' }
    const targets = await targetsFor({ workspaceId: workspace.id, channels: p.channels })
    if (targets.length === 0) return { error: 'Connect a Facebook Page or Instagram account in Channels to schedule' }
  }

  const data = {
    kind: p.kind,
    // A published post stays published; otherwise the button decides.
    ...(published ? {} : { status: p.schedule ? ('SCHEDULED' as const) : ('DRAFT' as const) }),
    // Social posts edited in the post editor don't send a title — keep the
    // stored one (a campaign post's angle) instead of wiping it.
    ...(p.title !== undefined ? { title: p.title || null } : {}),
    content: p.content,
    hashtags: [...new Set(p.hashtags)],
    mediaIds: p.mediaIds,
    channels: p.channels,
    scheduledAt: p.scheduledAt ? new Date(p.scheduledAt) : null,
  }

  let id = p.id
  if (id) {
    const res = await prisma.post.updateMany({ where: { id, workspaceId: workspace.id, status: { not: 'PUBLISHING' } }, data })
    if (res.count === 0) return { error: 'Post not found' }
    await syncCampaignRange(id)
  } else {
    const created = await prisma.post.create({
      data: { ...data, workspaceId: workspace.id, createdById: user.id, aiGenerated: p.aiGenerated ?? false },
    })
    id = created.id
  }
  revalidatePath('/app', 'layout')
  return { id }
}

// A campaign's date range follows its posts.
async function syncCampaignRange(postId: string, campaignId?: string | null) {
  const cid = campaignId ?? (await prisma.post.findUnique({ where: { id: postId }, select: { campaignId: true } }))?.campaignId
  if (!cid) return
  const range = await prisma.post.aggregate({ where: { campaignId: cid, scheduledAt: { not: null } }, _min: { scheduledAt: true }, _max: { scheduledAt: true } })
  if (range._min.scheduledAt && range._max.scheduledAt) {
    await prisma.campaign.update({ where: { id: cid }, data: { startsOn: range._min.scheduledAt, endsOn: range._max.scheduledAt } })
  }
}

export async function deletePost(id: string) {
  const { workspace } = await requireContext()
  const post = await prisma.post.findFirst({ where: { id, workspaceId: workspace.id }, select: { campaignId: true } })
  await prisma.post.deleteMany({ where: { id, workspaceId: workspace.id } })
  if (post?.campaignId) await syncCampaignRange(id, post.campaignId)
  revalidatePath('/app', 'layout')
  return {}
}

// Send a saved post to its connected accounts now. Accounts that already
// have it are skipped, so this also retries the ones that failed.
export async function publishNow(id: string): Promise<{ error?: string; published?: number; failed?: number }> {
  const { workspace } = await requireContext()
  const res = await publishPostNow(workspace.id, id)
  revalidatePath('/app', 'layout')
  return res
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

// AI images for a post, from a short description (and the post text). Each
// delivered image costs COST.image; failed ones are free.
export async function generatePostImages(input: { prompt: string; caption: string; count: number }): Promise<{ images?: { id: string; url: string }[]; error?: string }> {
  const { account, workspace, brand } = await requireContext()
  const COST = await prices()
  const prompt = input.prompt.trim().slice(0, 1000)
  const count = Math.min(4, Math.max(1, Math.floor(input.count) || 1))
  if (!prompt && !input.caption.trim()) return { error: 'Describe the image or write the post text first' }
  if (!aiEnabled()) return { error: 'AI generation is not connected yet.' }
  const max = count * COST.image
  if (account.creditBalance < max) return { error: notEnough(max, account.creditBalance) }

  const known = await withDossier(brand, workspace.id)
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, i) =>
      generateImage(workspace.name, known, prompt || input.caption.slice(0, 300), input.caption.slice(0, 2000), i, []).then((img) =>
        saveMedia(workspace.id, img.data, img.mime, prompt || 'Post image'),
      ),
    ),
  )
  const media = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  results.forEach((r) => r.status === 'rejected' && console.error('generatePostImages failed', r.reason))
  if (media.length === 0) return { error: 'The AI could not draw this. Try a different description.' }
  const ok = await charge(account.id, workspace.id, [
    { amount: media.length * COST.image, reason: 'AI_IMAGE', note: `${media.length} post image${media.length > 1 ? 's' : ''}`, action: 'image', units: media.length },
  ])
  if (!ok) return { error: 'You ran out of credits while this was generating. Choose a plan to get more.' }
  revalidatePath('/app', 'layout')
  return { images: media.map((m) => ({ id: m.id, url: mediaUrl(m.id) })) }
}
