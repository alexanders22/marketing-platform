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
import { accountExpiredAlert, raiseAlert } from './alerts'
import { prisma } from './prisma'
import { ACTIVE_WORKSPACE } from './pause'
import { ctaLine, readCta, withUtm } from './cta'
import { connectorFor, NetworkError, tokenFor, type OutMedia, type Outgoing } from './networks'
import { titleOf } from './networks/types'
import { readMedia } from './storage'

// Networks Loudpilot can publish to: Meta's (meta.ts) and the connectors.
export const PUBLISHABLE = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'X', 'THREADS', 'TELEGRAM', 'PINTEREST'] as const

// A scheduled post more than this late (server down) is not sent on its own.
const MAX_LATE_MS = 24 * 60 * 60 * 1000
// A post stuck in PUBLISHING this long (crash mid-publish) is marked failed.
const STUCK_MS = 15 * 60 * 1000

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500)

// The text for one network: the post, its call to action (links tagged
// with UTM for that network), then the hashtags.
function outgoingText(post: { id: string; content: string; hashtags: string[]; cta: unknown; campaign?: { name: string } | null }, network: string) {
  const tags = post.hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')
  const cta = ctaLine(readCta(post.cta), network, { campaign: post.campaign?.name, postId: post.id })
  return [post.content.trim(), cta, tags].filter(Boolean).join('\n\n')
}

// The post's media for the networks: the images in the author's order, or
// its video. Each has a signed link the network can fetch (videos a longer
// one — networks download them later) and its bytes for upload APIs.
async function outgoingMedia(workspaceId: string, mediaIds: string[]) {
  if (mediaIds.length === 0) return { images: [] as OutMedia[], video: null }
  const rows = await prisma.media.findMany({ where: { workspaceId, id: { in: mediaIds } } })
  const out = (m: (typeof rows)[number]): OutMedia => ({
    id: m.id,
    kind: m.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE',
    mime: m.mime,
    bytes: m.bytes,
    width: m.width,
    height: m.height,
    durationMs: m.durationMs,
    url: signedMediaUrl(m.id, m.kind === 'VIDEO' ? 6 * 3600 : 3600),
    poster: m.posterId ? signedMediaUrl(m.posterId, 6 * 3600) : null,
    read: () => readMedia(m.path),
  })
  const video = rows.find((m) => m.kind === 'VIDEO')
  if (video) return { images: [] as OutMedia[], video: out(video) }
  const images = mediaIds.flatMap((id) => rows.filter((m) => m.id === id && m.mime.startsWith('image/')).map(out))
  return { images, video: null }
}

type PostForNetworks = { id: string; content: string; hashtags: string[]; cta: unknown; networkOptions?: unknown; campaign?: { name: string } | null }

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

async function sendTo(account: SocialAccount, post: PostForNetworks, media: { images: OutMedia[]; video: OutMedia | null }) {
  const text = outgoingText(post, account.network)
  if (account.network === 'FACEBOOK' || account.network === 'INSTAGRAM') {
    if (!account.accessTokenEnc) throw new MetaError('This account has no access token — reconnect it')
    const token = decrypt(account.accessTokenEnc)
    const out = { text, imageUrls: media.images.map((m) => m.url), videoUrl: media.video?.url }
    return account.network === 'FACEBOOK' ? publishToFacebook(account.externalId, token, out) : publishToInstagram(account.externalId, token, out)
  }
  const c = connectorFor(account.network)
  if (!c?.enabled()) throw new Error(`Publishing to ${account.network} is not turned on`)
  const cta = readCta(post.cta)
  const out: Outgoing = {
    text,
    title: titleOf(post.content, 100),
    link: cta?.url ? withUtm(cta.url, account.network, { campaign: post.campaign?.name, postId: post.id }) : null,
    ...media,
    options: ((post.networkOptions ?? {}) as Record<string, Record<string, unknown>>)[account.network] ?? {},
  }
  const problem = c.check?.(out)
  if (problem) throw new NetworkError(problem)
  return c.publish(account, await tokenFor(account), out)
}

const needsReconnect = (e: unknown) => (e instanceof MetaError && e.needsReconnect) || (e instanceof NetworkError && e.reconnect)

// Publish a post that the caller has already claimed (status PUBLISHING) to
// the given accounts. Accounts that already have it are skipped, so a retry
// only resends what failed.
export async function deliver(postId: string, targets: SocialAccount[]) {
  const post = await prisma.post.findUniqueOrThrow({ where: { id: postId }, include: { deliveries: true, campaign: { select: { name: true } } } })
  const media = await outgoingMedia(post.workspaceId, post.mediaIds)

  for (const account of targets) {
    if (post.deliveries.some((d) => d.socialAccountId === account.id && d.status === 'PUBLISHED')) continue
    let data: Prisma.PostDeliveryUncheckedCreateInput
    try {
      const r = await sendTo(account, post, media)
      data = { postId, socialAccountId: account.id, status: 'PUBLISHED', externalId: r.id, permalink: r.permalink, error: null }
    } catch (e) {
      data = { postId, socialAccountId: account.id, status: 'FAILED', error: errorText(e) }
      if (needsReconnect(e)) {
        await prisma.socialAccount.update({ where: { id: account.id }, data: { status: 'EXPIRED', lastError: errorText(e) } })
        await accountExpiredAlert(account, errorText(e))
      }
    }
    await prisma.postDelivery.upsert({
      where: { postId_socialAccountId: { postId, socialAccountId: account.id } },
      create: data,
      update: data,
    })
  }

  const deliveries = await prisma.postDelivery.findMany({ where: { postId }, include: { socialAccount: { select: { name: true } } } })
  const ok = deliveries.some((d) => d.status === 'PUBLISHED')
  const failed = deliveries.filter((d) => d.status === 'FAILED')
  if (failed.length) {
    await raiseAlert({
      workspaceId: post.workspaceId,
      kind: 'post_failed',
      severity: ok ? 'WARNING' : 'CRITICAL',
      title: ok ? `Post published only partly` : `Post could not be published`,
      body: failed.map((d) => `${d.socialAccount.name}: ${d.error ?? 'failed'}`).join(' · ').slice(0, 900),
      href: `/app/posts/${postId}`,
      dedupeKey: `post:${postId}:failed:${failed.map((d) => d.socialAccountId).sort().join(',')}:${new Date().toISOString().slice(0, 13)}`,
    })
  }
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
      workspace: ACTIVE_WORKSPACE,
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
  const a = d.socialAccount
  const c = connectorFor(a.network)
  if (c && !c.metrics) return null
  let metrics: PostMetrics
  try {
    if (c) metrics = (await c.metrics!(a, await tokenFor(a), d.externalId)) as PostMetrics
    else {
      const token = decrypt(a.accessTokenEnc!)
      metrics = a.network === 'INSTAGRAM' ? await instagramPostMetrics(d.externalId, token) : await facebookPostMetrics(d.externalId, token)
    }
  } catch (e) {
    if (needsReconnect(e)) {
      await prisma.socialAccount.update({ where: { id: d.socialAccountId }, data: { status: 'EXPIRED', lastError: errorText(e) } })
      await accountExpiredAlert(d.socialAccount, errorText(e))
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
      socialAccount: { status: 'ACTIVE', workspace: ACTIVE_WORKSPACE },
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

// "Publish now" for one post of a workspace — used by the editor and MCP.
export async function publishPostNow(workspaceId: string, postId: string): Promise<{ error?: string; published?: number; failed?: number }> {
  const post = await prisma.post.findFirst({ where: { id: postId, workspaceId } })
  if (!post || post.kind !== 'SOCIAL') return { error: 'Post not found' }
  const targets = await targetsFor(post)
  if (targets.length === 0) return { error: 'Connect an account for the networks picked on this post in Channels first' }
  const claimed = await prisma.post.updateMany({
    where: { id: postId, status: { in: ['DRAFT', 'SCHEDULED', 'FAILED', 'PUBLISHED'] } },
    data: { status: 'PUBLISHING' },
  })
  if (claimed.count !== 1) return { error: 'This post is being published right now' }
  try {
    const deliveries = await deliver(postId, targets)
    return {
      published: deliveries.filter((d) => d.status === 'PUBLISHED').length,
      failed: deliveries.filter((d) => d.status === 'FAILED').length,
    }
  } catch (e) {
    console.error('publishPostNow', postId, e)
    await prisma.post.update({ where: { id: postId }, data: { status: 'FAILED' } })
    return { error: 'Publishing failed — try again' }
  }
}
