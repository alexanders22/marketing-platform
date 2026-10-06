import 'server-only'
import { api, basic, form, NetworkError, type Connector, type OutMedia } from './types'

// X (Twitter) API v2 with OAuth 2.0 + PKCE. Access tokens live 2 hours and
// refresh tokens are single-use (tokenFor serialises refreshes). X bills
// per request — a post with a link costs more than one without.

const AUTH = () => process.env.X_AUTH_URL || 'https://x.com/i/oauth2/authorize'
const API = () => (process.env.X_API_URL || 'https://api.x.com').replace(/\/$/, '')
const id = () => process.env.X_CLIENT_ID || ''
const secret = () => process.env.X_CLIENT_SECRET || ''
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write']

type TokenRes = { access_token: string; refresh_token?: string; expires_in: number; scope?: string }
const token = (body: Record<string, string>) =>
  api<TokenRes>(`${API()}/2/oauth2/token`, { method: 'POST', headers: { authorization: basic(id(), secret()), 'content-type': 'application/x-www-form-urlencoded' }, body: form(body) }, 'X')

const auth = (t: string) => ({ authorization: `Bearer ${t}` })

async function uploadImage(t: string, m: OutMedia) {
  const f = new FormData()
  f.set('media', new Blob([new Uint8Array(await m.read())], { type: m.mime }))
  f.set('media_category', 'tweet_image')
  return (await api<{ data: { id: string } }>(`${API()}/2/media/upload`, { method: 'POST', headers: auth(t), body: f }, 'X')).data.id
}

async function uploadVideo(t: string, m: OutMedia) {
  const init = await api<{ data: { id: string } }>(`${API()}/2/media/upload/initialize`, {
    method: 'POST',
    headers: { ...auth(t), 'content-type': 'application/json' },
    body: JSON.stringify({ media_type: m.mime, total_bytes: m.bytes, media_category: 'tweet_video' }),
  }, 'X')
  const mediaId = init.data.id
  const bytes = await m.read()
  const CHUNK = 4 * 1024 * 1024
  for (let i = 0, seg = 0; i < bytes.length; i += CHUNK, seg++) {
    const f = new FormData()
    f.set('media', new Blob([new Uint8Array(bytes.subarray(i, i + CHUNK))]))
    f.set('segment_index', String(seg))
    await api(`${API()}/2/media/upload/${mediaId}/append`, { method: 'POST', headers: auth(t), body: f, timeoutMs: 300_000 }, 'X')
  }
  let info = (await api<{ data: { processing_info?: { state: string; check_after_secs?: number } } }>(`${API()}/2/media/upload/${mediaId}/finalize`, { method: 'POST', headers: auth(t) }, 'X')).data.processing_info
  for (let i = 0; info && info.state !== 'succeeded' && i < 40; i++) {
    if (info.state === 'failed') throw new NetworkError('X could not process the video')
    await new Promise((r) => setTimeout(r, Math.min(10, info!.check_after_secs ?? 3) * 1000))
    info = (await api<{ data: { processing_info?: { state: string; check_after_secs?: number } } }>(`${API()}/2/media/upload?command=STATUS&media_id=${mediaId}`, { headers: auth(t) }, 'X')).data.processing_info
  }
  return mediaId
}

export const x: Connector = {
  network: 'X',
  label: 'X',
  about: 'Posts with up to 4 photos or a video',
  setup: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  enabled: () => Boolean(id() && secret()),
  oauth: {
    pkce: true,
    authUrl: ({ state, redirectUri, challenge }) =>
      `${AUTH()}?${form({ response_type: 'code', client_id: id(), redirect_uri: redirectUri, scope: SCOPES.join(' '), state, code_challenge: challenge, code_challenge_method: 'S256' })}`,
    async exchange({ code, redirectUri, verifier }) {
      const t = await token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier ?? '' })
      const me = await api<{ data: { id: string; name: string; username: string; profile_image_url?: string } }>(`${API()}/2/users/me?user.fields=profile_image_url`, { headers: auth(t.access_token) }, 'X')
      return [
        {
          externalId: me.data.id,
          name: me.data.name,
          handle: me.data.username,
          avatarUrl: me.data.profile_image_url ?? null,
          token: t.access_token,
          refresh: t.refresh_token ?? null,
          expiresAt: new Date(Date.now() + t.expires_in * 1000),
          scopes: (t.scope ?? SCOPES.join(' ')).split(' '),
        },
      ]
    },
  },
  async refresh(_, refresh) {
    const t = await token({ grant_type: 'refresh_token', refresh_token: refresh })
    return { token: t.access_token, refresh: t.refresh_token ?? null, expiresAt: new Date(Date.now() + t.expires_in * 1000) }
  },
  check: (out) => (out.text.length > 280 ? 'X posts are up to 280 characters' : out.images.length > 4 ? 'X posts take up to 4 photos' : null),
  async publish(a, t, out) {
    const ids: string[] = []
    if (out.video) ids.push(await uploadVideo(t, out.video))
    else for (const m of out.images.slice(0, 4)) ids.push(await uploadImage(t, m))
    const r = await api<{ data: { id: string } }>(`${API()}/2/tweets`, {
      method: 'POST',
      headers: { ...auth(t), 'content-type': 'application/json' },
      body: JSON.stringify({ text: out.text, ...(ids.length ? { media: { media_ids: ids } } : {}) }),
    }, 'X')
    return { id: r.data.id, permalink: `https://x.com/${a.handle ?? 'i'}/status/${r.data.id}` }
  },
  async metrics(_, t, postId) {
    const r = await api<{ data: { public_metrics?: Record<string, number> } }>(`${API()}/2/tweets/${postId}?tweet.fields=public_metrics`, { headers: auth(t) }, 'X')
    const m = r.data.public_metrics ?? {}
    const likes = m.like_count ?? 0
    const comments = m.reply_count ?? 0
    const shares = (m.retweet_count ?? 0) + (m.quote_count ?? 0)
    const saves = m.bookmark_count ?? 0
    return { views: m.impression_count ?? 0, likes, comments, shares, saves, interactions: likes + comments + shares + saves }
  },
}
