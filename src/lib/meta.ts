import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { appUrl } from './mail'

// Meta (Facebook Pages, Instagram professional accounts, ad accounts) over
// the Graph API. Enabled only when META_APP_ID / META_APP_SECRET are set.
// META_GRAPH_URL / META_DIALOG_URL exist so tests can point at a fake Graph.

export const META_VERSION = process.env.META_GRAPH_VERSION || 'v26.0'
const GRAPH = (process.env.META_GRAPH_URL || 'https://graph.facebook.com').replace(/\/$/, '')
const DIALOG = process.env.META_DIALOG_URL || `https://www.facebook.com/${META_VERSION}/dialog/oauth`

// Publishing + insights for Pages and Instagram, read access to ad accounts.
export const META_SCOPES = (
  process.env.META_SCOPES ||
  [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'read_insights',
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_insights',
    'business_management',
    'ads_read',
    'pages_messaging',
    'pages_manage_metadata',
    'instagram_manage_messages',
  ].join(',')
).split(',')

// Signed { s: state, ws?: workspaceId, ret?: returnUrl } for the callback.
export const META_STATE_COOKIE = 'khma_meta_state'

export const metaEnabled = () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET)
export const metaRedirectUri = () => `${appUrl()}/auth/meta/callback`

export class MetaError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message)
  }
  // Token expired, revoked or the permission was removed: reconnect needed.
  get needsReconnect() {
    const c = this.code ?? 0
    return c === 190 || c === 102 || c === 10 || (c >= 200 && c < 300)
  }
}

const proof = (token: string) => createHmac('sha256', process.env.META_APP_SECRET!).update(token).digest('hex')

type Params = Record<string, string | number | boolean | undefined>

export async function graph<T = Record<string, unknown>>(
  path: string,
  { token, method = 'GET', params = {} }: { token?: string; method?: 'GET' | 'POST' | 'DELETE'; params?: Params } = {},
): Promise<T> {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v))
  if (token) {
    q.set('access_token', token)
    q.set('appsecret_proof', proof(token))
  }
  const url = `${GRAPH}/${META_VERSION}/${path.replace(/^\//, '')}`
  const res = await fetch(method === 'GET' ? `${url}?${q}` : url, {
    method,
    ...(method === 'GET' ? {} : { body: q, headers: { 'content-type': 'application/x-www-form-urlencoded' } }),
    signal: AbortSignal.timeout(30_000),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } }
  if (!res.ok || body.error) {
    const e = body.error ?? {}
    throw new MetaError(e.message || `Meta API error ${res.status}`, e.code, e.error_subcode)
  }
  return body as T
}

/* ─── OAuth ────────────────────────────────────────────────────────────── */

export function metaAuthUrl(state: string) {
  const url = new URL(DIALOG)
  const params: Record<string, string> = {
    client_id: process.env.META_APP_ID!,
    redirect_uri: metaRedirectUri(),
    state,
    response_type: 'code',
  }
  // Facebook Login for Business uses a configuration id instead of scopes.
  if (process.env.META_CONFIG_ID) params.config_id = process.env.META_CONFIG_ID
  else params.scope = META_SCOPES.join(',')
  url.search = new URLSearchParams(params).toString()
  return url.toString()
}

// Code → short-lived user token → long-lived (~60 days) user token. Page
// tokens read with a long-lived user token do not expire.
export async function exchangeMetaCode(code: string) {
  const short = await graph<{ access_token: string }>('oauth/access_token', {
    params: {
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      redirect_uri: metaRedirectUri(),
      code,
    },
  })
  const long = await graph<{ access_token: string; expires_in?: number }>('oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: short.access_token,
    },
  })
  const me = await graph<{ id: string; name: string }>('me', { token: long.access_token, params: { fields: 'id,name' } })
  const perms = await graph<{ data: { permission: string; status: string }[] }>('me/permissions', { token: long.access_token })
  return {
    token: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
    userId: me.id,
    userName: me.name,
    granted: perms.data.filter((p) => p.status === 'granted').map((p) => p.permission),
  }
}

export type MetaPage = {
  id: string
  name: string
  access_token: string
  picture?: { data?: { url?: string } }
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string }
}

export async function listPages(userToken: string) {
  const out: MetaPage[] = []
  let after: string | undefined
  for (let i = 0; i < 10; i++) {
    const page = await graph<{ data: MetaPage[]; paging?: { cursors?: { after?: string }; next?: string } }>('me/accounts', {
      token: userToken,
      params: {
        fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}',
        limit: 100,
        after,
      },
    })
    out.push(...page.data)
    if (!page.paging?.next) break
    after = page.paging.cursors?.after
  }
  return out
}

export type MetaAdAccount = { id: string; name: string; account_status: number; currency: string; timezone_name: string }

export async function listAdAccounts(userToken: string) {
  const res = await graph<{ data: MetaAdAccount[] }>('me/adaccounts', {
    token: userToken,
    params: { fields: 'id,name,account_status,currency,timezone_name', limit: 100 },
  })
  return res.data
}

/* ─── Signed requests (deauthorize / data deletion callbacks) ──────────── */

export function parseSignedRequest(signed: string): { user_id: string; algorithm: string } | null {
  const [sig, payload] = signed.split('.')
  if (!sig || !payload) return null
  const expected = createHmac('sha256', process.env.META_APP_SECRET!).update(payload).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (data.algorithm !== 'HMAC-SHA256' || !data.user_id) return null
    return { ...data, user_id: String(data.user_id) }
  } catch {
    return null
  }
}

/* ─── Publishing ───────────────────────────────────────────────────────── */

export type Outgoing = { text: string; imageUrls: string[] }

export async function publishToFacebook(pageId: string, token: string, { text, imageUrls }: Outgoing) {
  let id: string
  if (imageUrls.length === 0) {
    id = (await graph<{ id: string }>(`${pageId}/feed`, { token, method: 'POST', params: { message: text } })).id
  } else if (imageUrls.length === 1) {
    const r = await graph<{ id: string; post_id?: string }>(`${pageId}/photos`, {
      token,
      method: 'POST',
      params: { url: imageUrls[0], caption: text },
    })
    id = r.post_id ?? r.id
  } else {
    // Several photos: upload unpublished, then one feed post with all of them.
    const media: string[] = []
    for (const url of imageUrls) {
      const r = await graph<{ id: string }>(`${pageId}/photos`, { token, method: 'POST', params: { url, published: false } })
      media.push(r.id)
    }
    const params: Params = { message: text }
    media.forEach((m, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: m })))
    id = (await graph<{ id: string }>(`${pageId}/feed`, { token, method: 'POST', params })).id
  }
  const post = await graph<{ permalink_url?: string }>(id, { token, params: { fields: 'permalink_url' } }).catch(() => null)
  return { id, permalink: post?.permalink_url ?? `https://www.facebook.com/${id}` }
}

async function waitForContainer(id: string, token: string) {
  for (let i = 0; i < 20; i++) {
    const s = await graph<{ status_code?: string; status?: string }>(id, { token, params: { fields: 'status_code,status' } })
    if (!s.status_code || s.status_code === 'FINISHED') return
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new MetaError(`Instagram could not process the media: ${s.status ?? s.status_code}`)
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new MetaError('Instagram is still processing the media — try again in a minute')
}

export async function publishToInstagram(igId: string, token: string, { text, imageUrls }: Outgoing) {
  if (imageUrls.length === 0) throw new MetaError('Instagram posts need at least one image')
  let container: string
  if (imageUrls.length === 1) {
    container = (await graph<{ id: string }>(`${igId}/media`, { token, method: 'POST', params: { image_url: imageUrls[0], caption: text } })).id
  } else {
    const children: string[] = []
    for (const url of imageUrls.slice(0, 10)) {
      const c = await graph<{ id: string }>(`${igId}/media`, { token, method: 'POST', params: { image_url: url, is_carousel_item: true } })
      children.push(c.id)
    }
    for (const c of children) await waitForContainer(c, token)
    container = (
      await graph<{ id: string }>(`${igId}/media`, {
        token,
        method: 'POST',
        params: { media_type: 'CAROUSEL', children: children.join(','), caption: text },
      })
    ).id
  }
  await waitForContainer(container, token)
  const { id } = await graph<{ id: string }>(`${igId}/media_publish`, { token, method: 'POST', params: { creation_id: container } })
  const media = await graph<{ permalink?: string }>(id, { token, params: { fields: 'permalink' } }).catch(() => null)
  return { id, permalink: media?.permalink ?? null }
}

/* ─── Insights ─────────────────────────────────────────────────────────── */

export type PostMetrics = {
  reach?: number
  views?: number
  likes?: number
  comments?: number
  shares?: number
  saves?: number
  interactions?: number
}

type InsightRows = { data: { name: string; values?: { value: number | Record<string, number> }[]; total_value?: { value: number } }[] }

const valueOf = (row: InsightRows['data'][number]) => {
  const v = row.total_value?.value ?? row.values?.[0]?.value
  if (typeof v === 'number') return v
  if (v && typeof v === 'object') return Object.values(v).reduce((a, b) => a + (Number(b) || 0), 0)
  return undefined
}

// Metric names change between Graph versions; each source is read on its own
// so one rejected metric does not lose the rest.
export async function facebookPostMetrics(postId: string, token: string): Promise<PostMetrics> {
  const m: PostMetrics = {}
  const counts = await graph<{ comments?: { summary?: { total_count?: number } }; shares?: { count?: number }; reactions?: { summary?: { total_count?: number } } }>(
    postId,
    { token, params: { fields: 'comments.summary(true).limit(0),shares,reactions.summary(true).limit(0)' } },
  ).catch(() => null)
  if (counts) {
    m.likes = counts.reactions?.summary?.total_count ?? 0
    m.comments = counts.comments?.summary?.total_count ?? 0
    m.shares = counts.shares?.count ?? 0
  }
  const ins = await graph<InsightRows>(`${postId}/insights`, {
    token,
    params: { metric: 'post_total_media_view_unique,post_media_view' },
  }).catch(() => null)
  for (const row of ins?.data ?? []) {
    if (row.name === 'post_total_media_view_unique') m.reach = valueOf(row)
    if (row.name === 'post_media_view') m.views = valueOf(row)
  }
  m.interactions = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0)
  return m
}

export async function instagramPostMetrics(mediaId: string, token: string): Promise<PostMetrics> {
  const ins = await graph<InsightRows>(`${mediaId}/insights`, {
    token,
    params: { metric: 'reach,views,likes,comments,shares,saved,total_interactions' },
  })
  const m: PostMetrics = {}
  for (const row of ins.data) {
    const v = valueOf(row)
    if (row.name === 'reach') m.reach = v
    if (row.name === 'views') m.views = v
    if (row.name === 'likes') m.likes = v
    if (row.name === 'comments') m.comments = v
    if (row.name === 'shares') m.shares = v
    if (row.name === 'saved') m.saves = v
    if (row.name === 'total_interactions') m.interactions = v
  }
  return m
}
