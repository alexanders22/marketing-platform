import 'server-only'
import { api, form, NetworkError, type Connector } from './types'

// YouTube: videos and Shorts (vertical or square, up to 3 minutes) through
// the Data API, with the same Google OAuth client as Analytics. Turn on with
// YOUTUBE_ENABLED=1 once the YouTube scopes are added to the consent screen.
// Until Google audits the project, uploads stay private.

const AUTH = () => process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token'
const API = () => (process.env.YOUTUBE_API_URL || 'https://www.googleapis.com').replace(/\/$/, '')
const id = () => process.env.GA_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ''
const secret = () => process.env.GA_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || ''
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly']

type TokenRes = { access_token: string; refresh_token?: string; expires_in: number; scope?: string }
const token = (body: Record<string, string>) =>
  api<TokenRes>(TOKEN(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ client_id: id(), client_secret: secret(), ...body }) }, 'Google')

// YouTube refuses < and > in titles and descriptions.
const clean = (s: string) => s.replace(/[<>]/g, '')
const shortsSized = (w: number | null, h: number | null, ms: number | null) => !!w && !!h && h >= w && !!ms && ms <= 180_000

export const youtube: Connector = {
  network: 'YOUTUBE',
  label: 'YouTube',
  about: 'Videos and Shorts',
  setup: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'YOUTUBE_ENABLED'],
  enabled: () => Boolean(id() && secret() && process.env.YOUTUBE_ENABLED === '1'),
  oauth: {
    pkce: false,
    authUrl: ({ state, redirectUri }) =>
      `${AUTH()}?${form({ client_id: id(), redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '), state, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' })}`,
    async exchange({ code, redirectUri }) {
      const t = await token({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' })
      const granted = (t.scope ?? '').split(' ')
      if (!granted.includes(SCOPES[0])) throw new NetworkError('YouTube upload access was not granted')
      const r = await api<{ items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } } }[] }>(
        `${API()}/youtube/v3/channels?part=snippet&mine=true`,
        { headers: { authorization: `Bearer ${t.access_token}` } },
        'YouTube',
      )
      return (r.items ?? []).map((c) => ({
        externalId: c.id,
        name: c.snippet.title,
        handle: c.snippet.customUrl?.replace(/^@/, '') ?? null,
        avatarUrl: c.snippet.thumbnails?.default?.url ?? null,
        token: t.access_token,
        refresh: t.refresh_token ?? null,
        expiresAt: new Date(Date.now() + t.expires_in * 1000),
        scopes: granted,
      }))
    },
  },
  async refresh(_, refresh) {
    const t = await token({ refresh_token: refresh, grant_type: 'refresh_token' })
    return { token: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) }
  },
  check: (out) => (!out.video ? 'YouTube needs a video' : null),
  async publish(_, t, out) {
    const v = out.video!
    const body = JSON.stringify({
      snippet: { title: clean(out.title).slice(0, 100) || 'Video', description: clean(out.text).slice(0, 4900), categoryId: '22' },
      status: { privacyStatus: process.env.YOUTUBE_PRIVACY || 'public', selfDeclaredMadeForKids: false },
    })
    const start = await fetch(`${API()}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-length': String(v.bytes), 'x-upload-content-type': v.mime },
      body,
      signal: AbortSignal.timeout(60_000),
    })
    const session = start.headers.get('location')
    if (!start.ok || !session) {
      const e = (await start.json().catch(() => ({}))) as { error?: { message?: string } }
      throw new NetworkError(`YouTube: ${e.error?.message ?? `upload could not start (${start.status})`}`, start.status === 401)
    }
    const video = await api<{ id: string }>(session, { method: 'PUT', headers: { 'content-type': v.mime }, body: new Uint8Array(await v.read()), timeoutMs: 600_000 }, 'YouTube')
    const short = shortsSized(v.width, v.height, v.durationMs)
    return { id: video.id, permalink: short ? `https://www.youtube.com/shorts/${video.id}` : `https://www.youtube.com/watch?v=${video.id}` }
  },
  async metrics(_, t, videoId) {
    const r = await api<{ items?: { statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] }>(
      `${API()}/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}`,
      { headers: { authorization: `Bearer ${t}` } },
      'YouTube',
    )
    const s = r.items?.[0]?.statistics ?? {}
    const likes = Number(s.likeCount ?? 0)
    const comments = Number(s.commentCount ?? 0)
    return { views: Number(s.viewCount ?? 0), likes, comments, interactions: likes + comments }
  },
}
