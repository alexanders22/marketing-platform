import 'server-only'
import { randomUUID } from 'node:crypto'
import type { AlertSeverity, Prisma, SocialAccount } from '@prisma/client'
import { decrypt } from './crypto'
import { jpegCopy } from './ffmpeg'
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
import { ACTIVE_WORKSPACE, servedWorkspace } from './pause'
import { serviceOff, serviceOn } from './plans'
import { ctaLine, readCta, withUtm } from './cta'
import { connectorFor, NetworkError, tokenFor, type OutMedia, type Outgoing } from './networks'
import { titleOf } from './networks/types'
import { mediaFile, readMedia } from './storage'

// Networks Loudpilot can publish to: Meta's (meta.ts) and the connectors.
export const PUBLISHABLE = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'X', 'THREADS', 'TELEGRAM', 'PINTEREST'] as const

// A scheduled post more than this late (server down) is not sent on its own.
const MAX_LATE_MS = 24 * 60 * 60 * 1000
// A post stuck in PUBLISHING this long (crash mid-publish) is marked failed.
// Delivery bumps updatedAt after each account, so a long one isn't.
const STUCK_MS = 15 * 60 * 1000
// One publishDue at a time (overlapping ticks, several instances): a lease
// row in Setting, renewed while publishing (its updatedAt is the clock).
const LEASE = 'publisher-lease'
const LEASE_MS = 10 * 60 * 1000

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500)

// The text for one network: the post, its call to action (links tagged
// with UTM for that network), then the hashtags.
function outgoingText(post: { id: string; content: string; hashtags: string[]; cta: unknown; campaign?: { name: string } | null }, network: string) {
  const tags = post.hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')
  const cta = ctaLine(readCta(post.cta), network, { campaign: post.campaign?.name, postId: post.id })
  return [post.content.trim(), cta, tags].filter(Boolean).join('\n\n')
}

const networkName = (n: string) => (n === 'FACEBOOK' ? 'Facebook' : n === 'INSTAGRAM' ? 'Instagram' : (connectorFor(n)?.label ?? n))

// An image or video of the post as the networks get it; jpegUrl() links to
// a JPEG copy (made on first use) for Instagram, which takes JPEG only.
type Media = OutMedia & { jpegUrl: () => Promise<string> }
type PostMedia = { images: Media[]; video: Media | null }

// The post's media for the networks: the images in the author's order, or
// its video. Each has a signed link the network can fetch (videos a longer
// one — networks download them later) and its bytes for upload APIs.
async function outgoingMedia(workspaceId: string, mediaIds: string[]): Promise<PostMedia> {
  if (mediaIds.length === 0) return { images: [], video: null }
  const rows = await prisma.media.findMany({ where: { workspaceId, id: { in: mediaIds } } })
  const out = (m: (typeof rows)[number]): Media => ({
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
    jpegUrl: async () => {
      if (m.mime === 'image/jpeg') return signedMediaUrl(m.id, 3600)
      await jpegCopy(mediaFile(m.path), m.mime).catch(() => {
        throw new NetworkError('Instagram takes JPEG images only, and this image could not be converted')
      })
      return `${signedMediaUrl(m.id, 3600)}&format=jpeg`
    },
  })
  const video = rows.find((m) => m.kind === 'VIDEO')
  if (video) return { images: [], video: out(video) }
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

function outgoing(network: string, post: PostForNetworks, media: PostMedia): Outgoing {
  const cta = readCta(post.cta)
  return {
    text: outgoingText(post, network),
    title: titleOf(post.content, 100),
    link: cta?.url ? withUtm(cta.url, network, { campaign: post.campaign?.name, postId: post.id }) : null,
    ...media,
    options: ((post.networkOptions ?? {}) as Record<string, Record<string, unknown>>)[network] ?? {},
  }
}

// Why this post can't go to this network, before anything is sent.
function problemFor(network: string, post: PostForNetworks, media: PostMedia) {
  if (network === 'INSTAGRAM') return !media.video && media.images.length === 0 ? 'Instagram posts need an image or a video' : null
  if (network === 'FACEBOOK') return null
  const c = connectorFor(network)
  if (!c?.enabled()) return `Publishing to ${network} is not turned on`
  return c.check?.(outgoing(network, post, media)) ?? null
}

// The same checks for a post being scheduled, on the networks it would go
// to: the first problem, so scheduling refuses what would fail later.
export async function scheduleProblem(post: PostForNetworks & { workspaceId: string; mediaIds: string[] }, targets: SocialAccount[]) {
  const media = await outgoingMedia(post.workspaceId, post.mediaIds)
  for (const network of new Set(targets.map((a) => a.network))) {
    const problem = problemFor(network, post, media)
    if (problem) return problem
  }
  return null
}

async function sendTo(account: SocialAccount, post: PostForNetworks, media: PostMedia) {
  const problem = problemFor(account.network, post, media)
  if (problem) throw new NetworkError(problem)
  if (account.network === 'FACEBOOK' || account.network === 'INSTAGRAM') {
    if (!account.accessTokenEnc) throw new NetworkError('This account has no access token — reconnect it', true)
    const token = decrypt(account.accessTokenEnc)
    const text = outgoingText(post, account.network)
    if (account.network === 'FACEBOOK') return publishToFacebook(account.externalId, token, { text, imageUrls: media.images.map((m) => m.url), videoUrl: media.video?.url })
    const imageUrls = await Promise.all(media.images.slice(0, 10).map((m) => m.jpegUrl()))
    return publishToInstagram(account.externalId, token, { text, imageUrls, videoUrl: media.video?.url })
  }
  return connectorFor(account.network)!.publish(account, await tokenFor(account), outgoing(account.network, post, media))
}

const needsReconnect = (e: unknown) => (e instanceof MetaError && e.needsReconnect) || (e instanceof NetworkError && e.reconnect)
// Reading numbers: only a dead token (not a missing permission) needs reconnecting.
const tokenDead = (e: unknown) => (e instanceof MetaError && e.tokenDead) || (e instanceof NetworkError && e.reconnect)

const postAlert = (post: { id: string; workspaceId: string }, title: string, body: string, key: string, severity: AlertSeverity = 'CRITICAL') =>
  raiseAlert({ workspaceId: post.workspaceId, kind: 'post_failed', severity, title, body: body.slice(0, 900), href: `/app/posts/${post.id}`, dedupeKey: `post:${post.id}:${key}` })

// Publish a post that the caller has already claimed (status PUBLISHING) to
// the given accounts. Accounts that already have it are skipped, so a retry
// only resends what failed. `beat` runs after each account (lease renewal).
export async function deliver(postId: string, targets: SocialAccount[], beat?: () => Promise<unknown>) {
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
    // Still going: the stuck check leaves it alone.
    await prisma.post.updateMany({ where: { id: postId, status: 'PUBLISHING' }, data: { updatedAt: new Date() } })
    await beat?.()
  }

  const deliveries = await prisma.postDelivery.findMany({ where: { postId }, include: { socialAccount: { select: { name: true } } } })
  const ok = deliveries.some((d) => d.status === 'PUBLISHED')
  const failed = deliveries.filter((d) => d.status === 'FAILED')
  if (failed.length) {
    await postAlert(
      post,
      ok ? `Post published only partly` : `Post could not be published`,
      failed.map((d) => `${d.socialAccount.name}: ${d.error ?? 'failed'}`).join(' · '),
      `failed:${failed.map((d) => d.socialAccountId).sort().join(',')}:${new Date().toISOString().slice(0, 13)}`,
      ok ? 'WARNING' : 'CRITICAL',
    )
  }
  await prisma.post.updateMany({
    where: { id: postId },
    data: { status: ok ? 'PUBLISHED' : 'FAILED', publishedAt: ok ? (post.publishedAt ?? new Date()) : null },
  })
  return deliveries
}

// Networks picked on the post that it will not go to (no working account),
// each with the reason.
async function skippedNetworks(post: { workspaceId: string; channels: string[] }, targets: SocialAccount[]) {
  const missing = PUBLISHABLE.filter((n) => post.channels.includes(n) && !targets.some((a) => a.network === n))
  if (missing.length === 0) return []
  const lost = await prisma.socialAccount.findMany({ where: { workspaceId: post.workspaceId, network: { in: missing } }, select: { network: true } })
  return missing.map((n) => (lost.some((a) => a.network === n) ? `${networkName(n)} needs reconnecting` : `no ${networkName(n)} account is connected`))
}

async function takeLease(owner: string) {
  const created = await prisma.setting.createMany({ data: [{ key: LEASE, value: { owner } }], skipDuplicates: true })
  if (created.count === 1) return true
  // Left by a tick that died (not renewed for LEASE_MS): take it over.
  const taken = await prisma.setting.updateMany({ where: { key: LEASE, updatedAt: { lt: new Date(Date.now() - LEASE_MS) } }, data: { value: { owner }, updatedAt: new Date() } })
  return taken.count === 1
}
const renewLease = (owner: string) => prisma.setting.updateMany({ where: { key: LEASE, value: { path: ['owner'], equals: owner } }, data: { updatedAt: new Date() } })
const dropLease = (owner: string) => prisma.setting.deleteMany({ where: { key: LEASE, value: { path: ['owner'], equals: owner } } })

// Called every minute. Sends posts the author explicitly scheduled (status
// SCHEDULED) once their time has come. Planner drafts are never sent. One
// tick publishes at a time; another one meanwhile skips publishing.
export async function publishDue(now = new Date()) {
  const owner = randomUUID()
  if (!(await takeLease(owner))) return 0
  try {
    return await publishLeased(now, () => renewLease(owner))
  } finally {
    await dropLease(owner)
  }
}

async function publishLeased(now: Date, renew: () => Promise<unknown>) {
  const stuckBefore = new Date(now.getTime() - STUCK_MS)
  const stuck = await prisma.post.findMany({ where: { status: 'PUBLISHING', updatedAt: { lt: stuckBefore } }, select: { id: true, workspaceId: true } })
  for (const post of stuck) {
    const reset = await prisma.post.updateMany({ where: { id: post.id, status: 'PUBLISHING', updatedAt: { lt: stuckBefore } }, data: { status: 'FAILED' } })
    if (reset.count !== 1) continue
    const ok = await prisma.postDelivery.count({ where: { postId: post.id, status: 'PUBLISHED' } })
    await postAlert(
      post,
      ok ? `Post published only partly` : `Post could not be published`,
      'Publishing stopped part-way (the server restarted or a network did not answer). Open the post to see where it went out and publish it again — networks that already have it are skipped.',
      `stuck:${now.toISOString().slice(0, 13)}`,
      ok ? 'WARNING' : 'CRITICAL',
    )
  }

  // Held back too long (plan ended, paused, server down): never sent late —
  // the author is told to pick a new time.
  const lapsed = await prisma.post.findMany({
    where: { kind: 'SOCIAL', status: 'SCHEDULED', scheduledAt: { lt: new Date(now.getTime() - MAX_LATE_MS) } },
    select: { id: true, workspaceId: true, scheduledAt: true },
    take: 200,
  })
  for (const post of lapsed) {
    const missed = await prisma.post.updateMany({ where: { id: post.id, status: 'SCHEDULED', scheduledAt: post.scheduledAt }, data: { status: 'FAILED' } })
    if (missed.count !== 1) continue
    await postAlert(
      post,
      'Scheduled post was not sent',
      `It was due ${post.scheduledAt!.toISOString().slice(0, 16).replace('T', ' ')} UTC but could not go out within 24 hours (publishing was paused or the plan had ended), so it was not published. Pick a new time and schedule it again.`,
      'lapsed',
    )
  }

  const due = await prisma.post.findMany({
    where: {
      kind: 'SOCIAL',
      status: 'SCHEDULED',
      scheduledAt: { lte: now, gte: new Date(now.getTime() - MAX_LATE_MS) },
      channels: { hasSome: [...PUBLISHABLE] },
      // A plan that ended (past its grace days) holds scheduled posts back.
      workspace: servedWorkspace(now),
    },
    orderBy: { scheduledAt: 'asc' },
    take: 50,
  })

  let sent = 0
  for (const post of due) {
    // Taken only while still scheduled for now (not moved meanwhile).
    const claim = { id: post.id, status: 'SCHEDULED' as const, scheduledAt: { lte: now } }
    try {
      await renew()
      const targets = await targetsFor(post)
      const skipped = await skippedNetworks(post, targets)
      if (targets.length === 0) {
        const failed = await prisma.post.updateMany({ where: claim, data: { status: 'FAILED' } })
        if (failed.count === 1) await postAlert(post, 'Post could not be published', `Nothing was sent: ${skipped.join(', ')}. Fix it in Channels, then publish the post or schedule it again.`, 'no-accounts')
        continue
      }
      const claimed = await prisma.post.updateMany({ where: claim, data: { status: 'PUBLISHING' } })
      if (claimed.count !== 1) continue
      await deliver(post.id, targets, renew)
      sent++
      if (skipped.length) await postAlert(post, 'Post was not sent to every network', `Not sent: ${skipped.join(', ')}. The other networks got it. Fix it in Channels to post there next time.`, 'skipped', 'WARNING')
    } catch (e) {
      // updateMany: a post deleted meanwhile must not stop the rest.
      console.error('publish failed', post.id, e)
      await prisma.post.updateMany({ where: { id: post.id, status: 'PUBLISHING' }, data: { status: 'FAILED' } })
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
    // A dead token needs reconnecting; a missing insights permission (or a
    // network hiccup) is only noted — publishing goes on.
    const dead = tokenDead(e)
    await prisma.socialAccount.update({ where: { id: d.socialAccountId }, data: { lastError: errorText(e), ...(dead ? { status: 'EXPIRED' as const } : {}) } })
    if (dead) await accountExpiredAlert(d.socialAccount, errorText(e))
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
  const post = await prisma.post.findFirst({ where: { id: postId, workspaceId }, include: { workspace: { select: { account: true } } } })
  if (!post || post.kind !== 'SOCIAL') return { error: 'Post not found' }
  const account = post.workspace.account
  if (account && !serviceOn(account)) return { error: serviceOff(account) }
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
    await prisma.post.updateMany({ where: { id: postId, status: 'PUBLISHING' }, data: { status: 'FAILED' } })
    return { error: 'Publishing failed — try again' }
  }
}
