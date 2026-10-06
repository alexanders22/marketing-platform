import 'server-only'
import { api, form, NetworkError, type Connector } from './types'

// TikTok: Login Kit (web) + Content Posting API "Direct Post". Videos are
// uploaded from our storage (FILE_UPLOAD); photo posts need TikTok to fetch
// them from a verified domain (TIKTOK_PHOTOS=1 once terminal.loudpilot.app
// is verified). Until the app passes TikTok's audit, posts are private
// (SELF_ONLY) and accounts must be private.
//
// TikTok requires the person to choose, per post, who can see it and
// whether comments, duets and stitches are allowed; those come from the
// post editor (Post.networkOptions.TIKTOK).

const AUTH = () => process.env.TIKTOK_AUTH_URL || 'https://www.tiktok.com/v2/auth/authorize/'
const API = () => (process.env.TIKTOK_API_URL || 'https://open.tiktokapis.com').replace(/\/$/, '')
const key = () => process.env.TIKTOK_CLIENT_KEY || ''
const secret = () => process.env.TIKTOK_CLIENT_SECRET || ''
const photos = () => process.env.TIKTOK_PHOTOS === '1'
const SCOPES = ['user.info.basic', 'user.info.profile', 'video.publish', 'video.list']

export type TikTokOptions = { privacy?: string; comments?: boolean; duet?: boolean; stitch?: boolean; brand?: 'none' | 'own' | 'branded' }
export type CreatorInfo = {
  creator_nickname: string
  creator_username: string
  creator_avatar_url?: string
  privacy_level_options: string[]
  comment_disabled: boolean
  duet_disabled: boolean
  stitch_disabled: boolean
  max_video_post_duration_sec: number
}

type TokenRes = { access_token: string; expires_in: number; refresh_token: string; refresh_expires_in: number; open_id: string; scope: string }
const tokenCall = (body: Record<string, string>) =>
  api<TokenRes>(`${API()}/v2/oauth/token/`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ client_key: key(), client_secret: secret(), ...body }) }, 'TikTok')
const tokens = (t: TokenRes) => ({
  token: t.access_token,
  refresh: t.refresh_token,
  expiresAt: new Date(Date.now() + t.expires_in * 1000),
  refreshExpiresAt: new Date(Date.now() + t.refresh_expires_in * 1000),
})

// TikTok wraps answers as { data, error: { code: "ok" | … } }.
async function tt<T>(path: string, token: string, body?: unknown): Promise<T> {
  const r = await api<{ data: T; error?: { code: string; message?: string } }>(`${API()}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, 'TikTok')
  if (r.error && r.error.code !== 'ok') throw new NetworkError(explain(r.error.code, r.error.message), r.error.code === 'access_token_invalid' || r.error.code === 'scope_not_authorized')
  return r.data
}

function explain(code: string, message?: string) {
  if (code === 'unaudited_client_can_only_post_to_private_accounts') return 'TikTok: until Loudpilot passes TikTok’s review, posting works only for private TikTok accounts with “Only me” visibility.'
  if (code === 'spam_risk_too_many_posts') return 'TikTok: this account reached its daily posting limit — try tomorrow.'
  if (code === 'privacy_level_option_mismatch') return 'TikTok: the chosen visibility isn’t available for this account — pick another in the post.'
  if (code === 'url_ownership_unverified') return 'TikTok: photo posts need the Loudpilot domain verified in the TikTok app settings.'
  return `TikTok: ${message || code}`
}

export const creatorInfo = (token: string) => tt<CreatorInfo>('/v2/post/publish/creator_info/query/', token)

const MB = 1024 * 1024

async function waitPublished(token: string, publishId: string) {
  for (let i = 0; i < 24; i++) {
    const s = await tt<{ status: string; fail_reason?: string; publicaly_available_post_id?: (number | string)[] }>('/v2/post/publish/status/fetch/', token, { publish_id: publishId })
    if (s.status === 'FAILED') throw new NetworkError(`TikTok could not publish it: ${s.fail_reason ?? 'unknown reason'}`)
    if (s.status === 'PUBLISH_COMPLETE') return s.publicaly_available_post_id?.[0] ? String(s.publicaly_available_post_id[0]) : null
    await new Promise((r) => setTimeout(r, 5000))
  }
  return null
}

export const tiktok: Connector = {
  network: 'TIKTOK',
  label: 'TikTok',
  about: 'Videos (and photo posts once the domain is verified)',
  setup: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  enabled: () => Boolean(key() && secret()),
  oauth: {
    pkce: false,
    authUrl: ({ state, redirectUri }) => `${AUTH()}?${form({ client_key: key(), response_type: 'code', scope: SCOPES.join(','), redirect_uri: redirectUri, state })}`,
    async exchange({ code, redirectUri }) {
      const t = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri })
      const u = await api<{ data: { user: { open_id: string; display_name?: string; username?: string; avatar_url?: string } } }>(
        `${API()}/v2/user/info/?fields=open_id,avatar_url,display_name,username`,
        { headers: { authorization: `Bearer ${t.access_token}` } },
        'TikTok',
      )
      const user = u.data.user
      return [{ externalId: t.open_id, name: user.display_name || user.username || 'TikTok', handle: user.username ?? null, avatarUrl: user.avatar_url ?? null, ...tokens(t), scopes: t.scope.split(',') }]
    },
  },
  refresh: async (_, refresh) => tokens(await tokenCall({ grant_type: 'refresh_token', refresh_token: refresh })),
  check(out) {
    if (!out.video && !(photos() && out.images.length)) return photos() ? 'TikTok needs a video or photos' : 'TikTok needs a video'
    if (!(out.options as TikTokOptions).privacy) return 'Choose who can see this TikTok post (in the post editor, under TikTok)'
    return null
  },
  async publish(a, token, out) {
    const o = out.options as TikTokOptions
    const info = await creatorInfo(token)
    if (!info.privacy_level_options.includes(o.privacy!)) throw new NetworkError(explain('privacy_level_option_mismatch'))
    const brand = o.brand === 'own' ? { brand_organic_toggle: true } : o.brand === 'branded' ? { brand_content_toggle: true } : {}
    let publishId: string
    if (out.video) {
      const v = out.video
      if (v.durationMs && v.durationMs / 1000 > info.max_video_post_duration_sec) throw new NetworkError(`TikTok: this account can post videos up to ${info.max_video_post_duration_sec} seconds`)
      // One chunk under 64 MB; otherwise 10 MB chunks, the last one taking the rest.
      const chunk = v.bytes <= 64 * MB ? v.bytes : 10 * MB
      const count = Math.max(1, Math.floor(v.bytes / chunk))
      const init = await tt<{ publish_id: string; upload_url: string }>('/v2/post/publish/video/init/', token, {
        post_info: {
          title: out.text.slice(0, 2200),
          privacy_level: o.privacy,
          disable_comment: !o.comments || info.comment_disabled,
          disable_duet: !o.duet || info.duet_disabled,
          disable_stitch: !o.stitch || info.stitch_disabled,
          ...brand,
        },
        source_info: { source: 'FILE_UPLOAD', video_size: v.bytes, chunk_size: chunk, total_chunk_count: count },
      })
      const bytes = await v.read()
      for (let i = 0; i < count; i++) {
        const first = i * chunk
        const last = i === count - 1 ? v.bytes - 1 : first + chunk - 1
        const r = await fetch(init.upload_url, {
          method: 'PUT',
          headers: { 'content-type': v.mime, 'content-range': `bytes ${first}-${last}/${v.bytes}` },
          body: new Uint8Array(bytes.subarray(first, last + 1)),
          signal: AbortSignal.timeout(300_000),
        })
        if (!r.ok) throw new NetworkError(`TikTok video upload failed (${r.status})`)
      }
      publishId = init.publish_id
    } else {
      const init = await tt<{ publish_id: string }>('/v2/post/publish/content/init/', token, {
        post_info: { title: out.title.slice(0, 90), description: out.text.slice(0, 4000), privacy_level: o.privacy, disable_comment: !o.comments || info.comment_disabled, auto_add_music: true, ...brand },
        source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: out.images.slice(0, 35).map((m) => m.url) },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
      })
      publishId = init.publish_id
    }
    const postId = await waitPublished(token, publishId)
    // Private and still-processing posts have no public id yet.
    return postId
      ? { id: postId, permalink: a.handle ? `https://www.tiktok.com/@${a.handle}/video/${postId}` : null }
      : { id: `publish:${publishId}`, permalink: a.handle ? `https://www.tiktok.com/@${a.handle}` : null }
  },
  async metrics(_, token, externalId) {
    let videoId = externalId
    if (externalId.startsWith('publish:')) {
      const s = await tt<{ publicaly_available_post_id?: (number | string)[] }>('/v2/post/publish/status/fetch/', token, { publish_id: externalId.slice(8) })
      if (!s.publicaly_available_post_id?.[0]) return {}
      videoId = String(s.publicaly_available_post_id[0])
    }
    const r = await api<{ data: { videos: { view_count?: number; like_count?: number; comment_count?: number; share_count?: number }[] } }>(
      `${API()}/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count`,
      { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ filters: { video_ids: [videoId] } }) },
      'TikTok',
    )
    const v = r.data.videos[0] ?? {}
    const likes = v.like_count ?? 0
    const comments = v.comment_count ?? 0
    const shares = v.share_count ?? 0
    return { views: v.view_count ?? 0, likes, comments, shares, interactions: likes + comments + shares }
  },
}
