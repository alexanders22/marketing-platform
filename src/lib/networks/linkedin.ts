import 'server-only'
import type { SocialAccount } from '@prisma/client'
import { api, form, NetworkError, type Connector, type Found, type OutMedia } from './types'

// LinkedIn: the member's own profile ("Share on LinkedIn", w_member_social,
// self-serve) and the company Pages they administer (Community Management
// API). LinkedIn allows the Community Management API only as the sole
// product of an app, so Pages need a second app: LINKEDIN_PAGES_CLIENT_ID /
// _SECRET. Once it is set, new connections go through it (it can post as the
// member too); accounts remember which app issued their token.

const AUTH = () => process.env.LINKEDIN_AUTH_URL || 'https://www.linkedin.com/oauth/v2'
const API = () => (process.env.LINKEDIN_API_URL || 'https://api.linkedin.com').replace(/\/$/, '')
const VERSION = () => process.env.LINKEDIN_VERSION || '202609'
type App = { key: 'member' | 'pages'; id: string; secret: string; pages: boolean }
// The self-serve app (Sign In with LinkedIn + Share on LinkedIn). LINKEDIN_PAGES=1:
// this one app holds the Community Management API instead.
const memberApp = (): App => ({ key: 'member', id: process.env.LINKEDIN_CLIENT_ID || '', secret: process.env.LINKEDIN_CLIENT_SECRET || '', pages: process.env.LINKEDIN_PAGES === '1' })
const pagesApp = (): App | null => {
  const id = process.env.LINKEDIN_PAGES_CLIENT_ID || ''
  const secret = process.env.LINKEDIN_PAGES_CLIENT_SECRET || ''
  return id && secret ? { key: 'pages', id, secret, pages: true } : null
}
const connectApp = () => pagesApp() ?? memberApp()
const appOf = (a: SocialAccount) => ((a.meta as { app?: string } | null)?.app === 'pages' && pagesApp()) || memberApp()
// A Community Management app has no OpenID product: the profile comes from r_basicprofile.
const scopes = (app: App) =>
  app.pages ? ['r_basicprofile', 'w_member_social', 'w_organization_social', 'r_organization_social', 'rw_organization_admin'] : ['openid', 'profile', 'w_member_social']

const headers = (token: string, json = true) => ({
  authorization: `Bearer ${token}`,
  'LinkedIn-Version': VERSION(),
  'X-Restli-Protocol-Version': '2.0.0',
  ...(json ? { 'content-type': 'application/json' } : {}),
})
const rest = <T>(path: string, token: string, init: RequestInit = {}) => api<T>(`${API()}/rest/${path}`, { ...init, headers: { ...headers(token), ...(init.headers ?? {}) } }, 'LinkedIn')

type TokenRes = { access_token: string; expires_in: number; scope?: string; refresh_token?: string; refresh_token_expires_in?: number }
const tokens = (t: TokenRes) => ({
  token: t.access_token,
  refresh: t.refresh_token ?? null,
  expiresAt: new Date(Date.now() + t.expires_in * 1000),
  refreshExpiresAt: t.refresh_token_expires_in ? new Date(Date.now() + t.refresh_token_expires_in * 1000) : null,
})

// "little" text format: reserved characters are escaped, except # that
// starts a hashtag.
export const littleText = (s: string) => s.replace(/[\\|{}@[\]()<>*_~]|#(?![\p{L}\p{N}_])/gu, '\\$&')

async function uploadImage(token: string, owner: string, m: OutMedia) {
  const init = await rest<{ value: { uploadUrl: string; image: string } }>('images?action=initializeUpload', token, {
    method: 'POST',
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  })
  const put = await fetch(init.value.uploadUrl, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: new Uint8Array(await m.read()), signal: AbortSignal.timeout(120_000) })
  if (!put.ok) throw new NetworkError(`LinkedIn image upload failed (${put.status})`)
  return init.value.image
}

async function uploadVideo(token: string, owner: string, m: OutMedia) {
  const init = await rest<{ value: { video: string; uploadToken?: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] } }>(
    'videos?action=initializeUpload',
    token,
    { method: 'POST', body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes: m.bytes, uploadCaptions: false, uploadThumbnail: false } }) },
  )
  const bytes = await m.read()
  const etags: string[] = []
  for (const part of init.value.uploadInstructions) {
    const r = await fetch(part.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array(bytes.subarray(part.firstByte, part.lastByte + 1)),
      signal: AbortSignal.timeout(300_000),
    })
    if (!r.ok) throw new NetworkError(`LinkedIn video upload failed (${r.status})`)
    etags.push(r.headers.get('etag') ?? '')
  }
  await rest('videos?action=finalizeUpload', token, {
    method: 'POST',
    body: JSON.stringify({ finalizeUploadRequest: { video: init.value.video, uploadToken: init.value.uploadToken ?? '', uploadedPartIds: etags } }),
  })
  // Wait until LinkedIn has processed it (up to ~2 minutes).
  for (let i = 0; i < 24; i++) {
    const v = await rest<{ status?: string; processingFailureReason?: string }>(`videos/${encodeURIComponent(init.value.video)}`, token).catch(() => null)
    if (!v || v.status === 'AVAILABLE') break
    if (v.status === 'PROCESSING_FAILED') throw new NetworkError(`LinkedIn could not process the video${v.processingFailureReason ? `: ${v.processingFailureReason}` : ''}`)
    await new Promise((r) => setTimeout(r, 5000))
  }
  return init.value.video
}

const stat = (urn: string) => (urn.includes(':ugcPost:') ? 'ugcPosts' : 'shares')

export const linkedin: Connector = {
  network: 'LINKEDIN',
  label: 'LinkedIn',
  about: 'Posts with photos or video on your profile and your company Pages',
  setup: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  enabled: () => Boolean(memberApp().id && memberApp().secret) || pagesApp() !== null,
  oauth: {
    pkce: false,
    authUrl: ({ state, redirectUri }) => {
      const app = connectApp()
      return `${AUTH()}/authorization?${form({ response_type: 'code', client_id: app.id, redirect_uri: redirectUri, state, scope: scopes(app).join(' ') })}`
    },
    async exchange({ code, redirectUri }) {
      const app = connectApp()
      const t = await api<TokenRes>(`${AUTH()}/accessToken`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form({ grant_type: 'authorization_code', code, client_id: app.id, client_secret: app.secret, redirect_uri: redirectUri }),
      }, 'LinkedIn')
      const granted = (t.scope ?? scopes(app).join(',')).split(/[ ,]+/).filter(Boolean)
      const me = app.pages
        ? await api<{ id: string; localizedFirstName?: string; localizedLastName?: string }>(`${API()}/v2/me`, { headers: { authorization: `Bearer ${t.access_token}` } }, 'LinkedIn').then((m) => ({
            sub: m.id,
            name: [m.localizedFirstName, m.localizedLastName].filter(Boolean).join(' ') || undefined,
            picture: undefined as string | undefined,
          }))
        : await api<{ sub: string; name?: string; picture?: string }>(`${API()}/v2/userinfo`, { headers: { authorization: `Bearer ${t.access_token}` } }, 'LinkedIn')
      const base = { ...tokens(t), scopes: granted }
      const out: Found[] = [{ externalId: `urn:li:person:${me.sub}`, name: me.name ?? 'LinkedIn profile', avatarUrl: me.picture ?? null, meta: { kind: 'person', app: app.key }, ...base }]
      if (granted.includes('rw_organization_admin')) {
        const acl = await rest<{ elements: { organization?: string; organizationTarget?: string; state?: string }[] }>(
          'organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=50',
          t.access_token,
        ).catch(() => ({ elements: [] }))
        const ids = acl.elements.map((e) => (e.organization ?? e.organizationTarget ?? '').split(':').pop()!).filter(Boolean)
        if (ids.length) {
          const orgs = await rest<{ results: Record<string, { id: number; localizedName: string; vanityName?: string }> }>(`organizations?ids=List(${ids.join(',')})`, t.access_token).catch(() => ({ results: {} }))
          for (const o of Object.values(orgs.results ?? {}))
            out.push({ externalId: `urn:li:organization:${o.id}`, name: o.localizedName, handle: o.vanityName ?? null, meta: { kind: 'organization', app: app.key }, ...base })
        }
      }
      return out
    },
  },
  async refresh(a, refresh) {
    const app = appOf(a)
    const t = await api<TokenRes>(`${AUTH()}/accessToken`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ grant_type: 'refresh_token', refresh_token: refresh, client_id: app.id, client_secret: app.secret }),
    }, 'LinkedIn')
    return tokens(t)
  },
  check: (out) => (out.text.length > 3000 ? 'LinkedIn posts are up to 3,000 characters' : null),
  async publish(a, token, out) {
    const author = a.externalId
    let content: Record<string, unknown> | undefined
    if (out.video) content = { media: { id: await uploadVideo(token, author, out.video), title: out.title.slice(0, 200) } }
    else if (out.images.length === 1) content = { media: { id: await uploadImage(token, author, out.images[0]) } }
    else if (out.images.length > 1) {
      const ids = []
      for (const m of out.images.slice(0, 20)) ids.push(await uploadImage(token, author, m))
      content = { multiImage: { images: ids.map((id) => ({ id })) } }
    }
    const body = JSON.stringify({
      author,
      commentary: littleText(out.text),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
      ...(content ? { content } : {}),
    })
    // Fresh images can need a moment before a post may use them.
    for (let i = 0; ; i++) {
      const res = await fetch(`${API()}/rest/posts`, { method: 'POST', headers: headers(token), body, signal: AbortSignal.timeout(60_000) })
      if (res.ok) {
        const urn = res.headers.get('x-restli-id') ?? ''
        return { id: urn, permalink: urn ? `https://www.linkedin.com/feed/update/${urn}/` : null }
      }
      const err = (await res.json().catch(() => ({}))) as { message?: string }
      const msg = err.message ?? `LinkedIn error ${res.status}`
      if (i < 3 && content && res.status < 500 && /process|not.*(ready|available)|asset/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 4000))
        continue
      }
      throw new NetworkError(msg, res.status === 401, res.status)
    }
  },
  async metrics(a, token, urn) {
    if (a.externalId.startsWith('urn:li:organization:')) {
      const r = await rest<{ elements: { totalShareStatistics: { impressionCount?: number; uniqueImpressionsCount?: number; clickCount?: number; likeCount?: number; commentCount?: number; shareCount?: number } }[] }>(
        `organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(a.externalId)}&${stat(urn)}=List(${encodeURIComponent(urn)})`,
        token,
      )
      const s = r.elements[0]?.totalShareStatistics ?? {}
      const likes = Math.max(0, s.likeCount ?? 0)
      return { views: s.impressionCount ?? 0, reach: s.uniqueImpressionsCount ?? 0, likes, comments: s.commentCount ?? 0, shares: s.shareCount ?? 0, interactions: likes + (s.commentCount ?? 0) + (s.shareCount ?? 0) + (s.clickCount ?? 0) }
    }
    // Member posts: only with the post-analytics permission.
    if (!a.scopes.includes('r_member_postAnalytics')) return {}
    const entity = `(${urn.includes(':ugcPost:') ? 'ugc' : 'share'}:${encodeURIComponent(urn)})`
    const one = async (q: string) =>
      (await rest<{ elements: { count: number }[] }>(`memberCreatorPostAnalytics?q=entity&entity=${entity}&queryType=${q}&aggregation=TOTAL`, token).catch(() => ({ elements: [] }))).elements[0]?.count ?? 0
    const [views, reach, likes, comments, shares] = await Promise.all(['IMPRESSION', 'MEMBERS_REACHED', 'REACTION', 'COMMENT', 'RESHARE'].map(one))
    return { views, reach, likes, comments, shares, interactions: likes + comments + shares }
  },
}
