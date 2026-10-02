import 'server-only'
import type { Prisma, SocialAccount } from '@prisma/client'
import { decrypt } from './crypto'
import { signedMediaUrl } from './media-url'
import {
  MetaError,
  facebookPostMetrics,
  instagramPostMetrics,
  publishToFacebook,
  publishToInstagram,
  type PostMetrics,
} from './meta'
import { prisma } from './prisma'

// Networks Khma can publish to today.
export const PUBLISHABLE = ['FACEBOOK', 'INSTAGRAM'] as const

// A scheduled post more than this late (server down) is not sent on its own.
const MAX_LATE_MS = 24 * 60 * 60 * 1000
// A post stuck in PUBLISHING this long (crash mid-publish) is marked failed.
const STUCK_MS = 15 * 60 * 1000

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500)

function outgoingText(post: { content: string; hashtags: string[] }) {
  const tags = post.hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')
  return [post.content.trim(), tags].filter(Boolean).join('\n\n')
}

async function imageUrls(workspaceId: string, mediaIds: string[]) {
  if (mediaIds.length === 0) return []
  const media = await prisma.media.findMany({ where: { workspaceId, id: { in: mediaIds }, mime: { startsWith: 'image/' } } })
  // Keep the order the author chose.
  return mediaIds.filter((id) => media.some((m) => m.id === id)).map((id) => signedMediaUrl(id))
}

// Connected accounts a post goes to: every active account of each network
// picked on the post.
export async function targetsFor(post: { workspaceId: string; channels: string[] }) {
  const networks = PUBLISHABLE.filter((n) => post.channels.includes(n))
  if (networks.length === 0) return []
  return prisma.socialAccount.findMany({
    where: { workspaceId: post.workspaceId, network: { in: [...networks] }, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  })
}

async function sendTo(account: SocialAccount, text: string, images: string[]) {
  if (!account.accessTokenEnc) throw new MetaError('This account has no access token — reconnect it')
  const token = decrypt(account.accessTokenEnc)
  if (account.network === 'FACEBOOK') return publishToFacebook(account.externalId, token, { text, imageUrls: images })
  if (account.network === 'INSTAGRAM') return publishToInstagram(account.externalId, token, { text, imageUrls: images })
  throw new Error(`Publishing to ${account.network} is not supported yet`)
}

// Publish a post that the caller has already claimed (status PUBLISHING) to
// the given accounts. Accounts that already have it are skipped, so a retry
// only resends what failed.
export async function deliver(postId: string, targets: SocialAccount[]) {
  const post = await prisma.post.findUniqueOrThrow({ where: { id: postId }, include: { deliveries: true } })
  const text = outgoingText(post)
  const images = await imageUrls(post.workspaceId, post.mediaIds)

  for (const account of targets) {
    if (post.deliveries.some((d) => d.socialAccountId === account.id && d.status === 'PUBLISHED')) continue
    let data: Prisma.PostDeliveryUncheckedCreateInput
    try {
      const r = await sendTo(account, text, images)
      data = { postId, socialAccountId: account.id, status: 'PUBLISHED', externalId: r.id, permalink: r.permalink, error: null }
    } catch (e) {
      data = { postId, socialAccountId: account.id, status: 'FAILED', error: errorText(e) }
      if (e instanceof MetaError && e.needsReconnect) {
        await prisma.socialAccount.update({ where: { id: account.id }, data: { status: 'EXPIRED', lastError: errorText(e) } })
      }
    }
    await prisma.postDelivery.upsert({
      where: { postId_socialAccountId: { postId, socialAccountId: account.id } },
      create: data,
      update: data,
    })
  }

  const deliveries = await prisma.postDelivery.findMany({ where: { postId } })
  const ok = deliveries.some((d) => d.status === 'PUBLISHED')
  await prisma.post.update({
    where: { id: postId },
    data: { status: ok ? 'PUBLISHED' : 'FAILED', publishedAt: ok ? (post.publishedAt ?? new Date()) : null },
  })
  return deliveries
}

// Called every minute. Sends posts the author explicitly scheduled (status
// SCHEDULED) once their time has come. Planner drafts are never sent.
export async function publishDue(now = new Date()) {
  await prisma.post.updateMany({
    where: { status: 'PUBLISHING', updatedAt: { lt: new Date(now.getTime() - STUCK_MS) } },
    data: { status: 'FAILED' },
  })

  const due = await prisma.post.findMany({
    where: {
      kind: 'SOCIAL',
      status: 'SCHEDULED',
      scheduledAt: { lte: now, gte: new Date(now.getTime() - MAX_LATE_MS) },
      channels: { hasSome: [...PUBLISHABLE] },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 50,
  })

  let sent = 0
  for (const post of due) {
    const targets = await targetsFor(post)
    if (targets.length === 0) {
      await prisma.post.update({ where: { id: post.id }, data: { status: 'FAILED' } })
      continue
    }
    const claimed = await prisma.post.updateMany({ where: { id: post.id, status: 'SCHEDULED' }, data: { status: 'PUBLISHING' } })
    if (claimed.count !== 1) continue
    try {
      await deliver(post.id, targets)
      sent++
    } catch (e) {
      console.error('publish failed', post.id, e)
      await prisma.post.update({ where: { id: post.id }, data: { status: 'FAILED' } })
    }
  }
  return sent
}

/* ─── Insights ─────────────────────────────────────────────────────────── */

// Insights for one delivery. Saved even when partial.
export async function refreshDelivery(id: string) {
  const d = await prisma.postDelivery.findUnique({ where: { id }, include: { socialAccount: true } })
  if (!d || d.status !== 'PUBLISHED' || !d.externalId || !d.socialAccount.accessTokenEnc) return null
  const token = decrypt(d.socialAccount.accessTokenEnc)
  let metrics: PostMetrics
  try {
    metrics =
      d.socialAccount.network === 'INSTAGRAM'
        ? await instagramPostMetrics(d.externalId, token)
        : await facebookPostMetrics(d.externalId, token)
  } catch (e) {
    if (e instanceof MetaError && e.needsReconnect) {
      await prisma.socialAccount.update({ where: { id: d.socialAccountId }, data: { status: 'EXPIRED', lastError: errorText(e) } })
    }
    await prisma.postDelivery.update({ where: { id }, data: { metricsAt: new Date() } })
    return null
  }
  await prisma.postDelivery.update({ where: { id }, data: { metrics, metricsAt: new Date() } })
  return metrics
}

// Posts from the last 30 days: hourly while fresh (first 2 days), then every
// 12 hours.
export async function refreshInsights(now = new Date(), limit = 100) {
  const h = 60 * 60 * 1000
  const rows = await prisma.postDelivery.findMany({
    where: {
      status: 'PUBLISHED',
      socialAccount: { status: 'ACTIVE' },
      createdAt: { gte: new Date(now.getTime() - 30 * 24 * h) },
      OR: [
        { metricsAt: null },
        { createdAt: { gte: new Date(now.getTime() - 48 * h) }, metricsAt: { lt: new Date(now.getTime() - h) } },
        { metricsAt: { lt: new Date(now.getTime() - 12 * h) } },
      ],
    },
    orderBy: { metricsAt: { sort: 'asc', nulls: 'first' } },
    take: limit,
    select: { id: true },
  })
  for (const r of rows) await refreshDelivery(r.id)
  return rows.length
}
