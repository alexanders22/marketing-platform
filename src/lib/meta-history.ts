import 'server-only'
import type { SocialAccount } from '@prisma/client'
import { accountExpiredAlert } from './alerts'
import { decrypt } from './crypto'
import { MetaError, graph } from './meta'
import { pickResult } from './meta-ads'
import { prisma } from './prisma'

// Reads what the company already published and advertised, so the audit and
// the strategist learn from real results instead of guessing.

const MONTHS_BACK = 12
const MAX_POSTS = 600

type Paged<T> = { data: T[]; paging?: { cursors?: { after?: string }; next?: string } }

async function* pages<T>(path: string, token: string, params: Record<string, string | number>, max: number) {
  let after: string | undefined
  let n = 0
  for (let i = 0; i < 30 && n < max; i++) {
    const r = await graph<Paged<T>>(path, { token, params: { ...params, after } })
    for (const item of r.data) {
      if (n++ >= max) return
      yield item
    }
    if (!r.paging?.next) return
    after = r.paging.cursors?.after
  }
}

type Insights = { data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }
const metric = (ins: Insights | undefined, name: string) => {
  const row = ins?.data?.find((d) => d.name === name)
  const v = row?.total_value?.value ?? row?.values?.[0]?.value
  return typeof v === 'number' ? v : undefined
}

type FbPost = {
  id: string
  message?: string
  created_time: string
  permalink_url?: string
  full_picture?: string
  attachments?: { data?: { media_type?: string; type?: string }[] }
  shares?: { count?: number }
  reactions?: { summary?: { total_count?: number } }
  comments?: { summary?: { total_count?: number } }
  insights?: Insights
}

type IgMedia = {
  id: string
  caption?: string
  media_type?: string
  media_product_type?: string
  timestamp: string
  permalink?: string
  media_url?: string
  thumbnail_url?: string
  like_count?: number
  comments_count?: number
  insights?: Insights
}

function fbFormat(p: FbPost) {
  const a = p.attachments?.data?.[0]
  const t = `${a?.media_type ?? ''} ${a?.type ?? ''}`.toLowerCase()
  if (t.includes('video')) return 'VIDEO'
  if (t.includes('album') || t.includes('carousel')) return 'CAROUSEL'
  if (t.includes('photo')) return 'IMAGE'
  if (t.includes('share') || t.includes('link')) return 'LINK'
  return p.full_picture ? 'IMAGE' : 'TEXT'
}

function igFormat(m: IgMedia) {
  if (m.media_product_type === 'REELS') return 'REEL'
  if (m.media_type === 'CAROUSEL_ALBUM') return 'CAROUSEL'
  if (m.media_type === 'VIDEO') return 'VIDEO'
  return 'IMAGE'
}

const since = () => Math.floor((Date.now() - MONTHS_BACK * 31 * 86_400_000) / 1000)

// Insights asked through field expansion; if the API refuses the metric list
// (it changes between versions), read the same posts without insights.
async function* fbPosts(pageId: string, token: string) {
  const base = 'id,message,created_time,permalink_url,full_picture,attachments{media_type,type},shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)'
  try {
    yield* pages<FbPost>(`${pageId}/published_posts`, token, { fields: `${base},insights.metric(post_total_media_view_unique,post_media_view)`, since: since(), limit: 50 }, MAX_POSTS)
  } catch (e) {
    if (e instanceof MetaError && e.needsReconnect) throw e
    yield* pages<FbPost>(`${pageId}/published_posts`, token, { fields: base, since: since(), limit: 50 }, MAX_POSTS)
  }
}

async function* igMedia(igId: string, token: string) {
  const base = 'id,caption,media_type,media_product_type,timestamp,permalink,media_url,thumbnail_url,like_count,comments_count'
  try {
    yield* pages<IgMedia>(`${igId}/media`, token, { fields: `${base},insights.metric(reach,views,saved,shares,total_interactions)`, limit: 50 }, MAX_POSTS)
  } catch (e) {
    if (e instanceof MetaError && e.needsReconnect) throw e
    yield* pages<IgMedia>(`${igId}/media`, token, { fields: base, limit: 50 }, MAX_POSTS)
  }
}

export async function importPostHistory(account: SocialAccount) {
  if (!account.accessTokenEnc || account.status !== 'ACTIVE' || !['FACEBOOK', 'INSTAGRAM'].includes(account.network)) return 0
  const token = decrypt(account.accessTokenEnc)
  const fromKhma = new Set(
    (await prisma.postDelivery.findMany({ where: { socialAccountId: account.id, externalId: { not: null } }, select: { externalId: true } })).map(
      (d) => d.externalId!,
    ),
  )
  const cutoff = Date.now() - MONTHS_BACK * 31 * 86_400_000
  let n = 0
  try {
    if (account.network === 'FACEBOOK') {
      for await (const p of fbPosts(account.externalId, token)) {
        const likes = p.reactions?.summary?.total_count ?? 0
        const comments = p.comments?.summary?.total_count ?? 0
        const shares = p.shares?.count ?? 0
        await save(account, p.id, {
          network: 'FACEBOOK',
          format: fbFormat(p),
          text: p.message ?? '',
          permalink: p.permalink_url ?? null,
          imageUrl: p.full_picture ?? null,
          publishedAt: new Date(p.created_time),
          metrics: {
            reach: metric(p.insights, 'post_total_media_view_unique'),
            views: metric(p.insights, 'post_media_view'),
            likes,
            comments,
            shares,
            engagements: likes + comments + shares,
          },
          fromKhma: fromKhma.has(p.id),
        })
        n++
      }
    } else {
      for await (const m of igMedia(account.externalId, token)) {
        if (Date.parse(m.timestamp) < cutoff) break
        const likes = m.like_count ?? 0
        const comments = m.comments_count ?? 0
        const saves = metric(m.insights, 'saved')
        const shares = metric(m.insights, 'shares')
        await save(account, m.id, {
          network: 'INSTAGRAM',
          format: igFormat(m),
          text: m.caption ?? '',
          permalink: m.permalink ?? null,
          imageUrl: m.thumbnail_url ?? m.media_url ?? null,
          publishedAt: new Date(m.timestamp),
          metrics: {
            reach: metric(m.insights, 'reach'),
            views: metric(m.insights, 'views'),
            likes,
            comments,
            shares,
            saves,
            engagements: metric(m.insights, 'total_interactions') ?? likes + comments + (shares ?? 0) + (saves ?? 0),
          },
          fromKhma: fromKhma.has(m.id),
        })
        n++
      }
    }
  } catch (e) {
    if (e instanceof MetaError && e.needsReconnect) {
      const message = e.message.slice(0, 500)
      await prisma.socialAccount.update({ where: { id: account.id }, data: { status: 'EXPIRED', lastError: message } })
      await accountExpiredAlert(account, message)
    }
    throw e
  }
  await prisma.socialAccount.update({ where: { id: account.id }, data: { historyAt: new Date() } })
  return n
}

async function save(
  account: SocialAccount,
  externalId: string,
  data: { network: string; format: string; text: string; permalink: string | null; imageUrl: string | null; publishedAt: Date; metrics: Record<string, number | undefined>; fromKhma: boolean },
) {
  // Drop undefined metrics: "unknown" must not read as zero.
  const metrics = Object.fromEntries(Object.entries(data.metrics).filter(([, v]) => typeof v === 'number'))
  const row = { ...data, text: data.text.slice(0, 5000), metrics }
  await prisma.socialPost.upsert({
    where: { socialAccountId_externalId: { socialAccountId: account.id, externalId } },
    create: { workspaceId: account.workspaceId, socialAccountId: account.id, externalId, ...row },
    update: row,
  })
}

/* ─── Ads (creative level) ─────────────────────────────────────────────── */

// Ad results over the last 12 months, like the post history.
const today = () => new Date().toISOString().slice(0, 10)
const yearAgo = () => new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)

type RawAd = {
  id: string
  name: string
  campaign_id: string
  effective_status?: string
  creative?: { title?: string; body?: string; image_url?: string; thumbnail_url?: string; call_to_action_type?: string }
  insights?: { data?: { spend?: string; impressions?: string; clicks?: string; reach?: string; actions?: { action_type: string; value: string }[] }[] }
}

export async function importAds(account: SocialAccount) {
  if (!account.accessTokenEnc || account.status !== 'ACTIVE' || account.network !== 'META_ADS') return 0
  const token = decrypt(account.accessTokenEnc)
  const campaigns = new Map(
    (await prisma.adCampaign.findMany({ where: { socialAccountId: account.id }, select: { id: true, externalId: true, objective: true } })).map((c) => [c.externalId, c]),
  )
  let n = 0
  for await (const ad of pages<RawAd>(`${account.externalId}/ads`, token, {
    fields: `id,name,campaign_id,effective_status,creative{title,body,image_url,thumbnail_url,call_to_action_type},insights.time_range(${JSON.stringify({ since: yearAgo(), until: today() })}){spend,impressions,clicks,reach,actions}`,
    limit: 100,
  }, 500)) {
    const c = campaigns.get(ad.campaign_id)
    if (!c) continue
    const i = ad.insights?.data?.[0]
    const picked = pickResult(c.objective, i?.actions ?? [], [], Number(i?.reach ?? 0))
    const data = {
      name: ad.name,
      status: ad.effective_status ?? 'UNKNOWN',
      title: ad.creative?.title ?? null,
      body: ad.creative?.body?.slice(0, 3000) ?? null,
      imageUrl: ad.creative?.image_url ?? ad.creative?.thumbnail_url ?? null,
      cta: ad.creative?.call_to_action_type ?? null,
      spend: Number(i?.spend ?? 0),
      impressions: Number(i?.impressions ?? 0),
      clicks: Number(i?.clicks ?? 0),
      results: picked.results,
    }
    await prisma.adItem.upsert({
      where: { campaignId_externalId: { campaignId: c.id, externalId: ad.id } },
      create: { campaignId: c.id, externalId: ad.id, ...data },
      update: data,
    })
    n++
  }
  return n
}
