import 'server-only'
import { api, form, NetworkError, type Connector } from './types'

// Threads: its own Meta app ("Access the Threads API" use case, Threads app
// id and secret). Long-lived tokens last 60 days and are refreshed with
// themselves; there is no separate refresh token.

const AUTH = () => process.env.THREADS_AUTH_URL || 'https://threads.net/oauth/authorize'
const GRAPH = () => (process.env.THREADS_API_URL || 'https://graph.threads.net').replace(/\/$/, '')
const id = () => process.env.THREADS_APP_ID || ''
const secret = () => process.env.THREADS_APP_SECRET || ''
const SCOPES = ['threads_basic', 'threads_content_publish', 'threads_manage_insights']
const DAY = 86_400_000

const g = <T>(path: string, init: RequestInit = {}) => api<T>(`${GRAPH()}/v1.0/${path}`, init, 'Threads')
const post = <T>(path: string, token: string, body: Record<string, string | undefined>) =>
  g<T>(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ ...body, access_token: token }) })

// Wait until Threads has fetched and processed a container.
async function ready(container: string, token: string, video: boolean) {
  for (let i = 0; i < (video ? 30 : 15); i++) {
    const s = await g<{ status?: string; error_message?: string }>(`${container}?${form({ fields: 'status,error_message', access_token: token })}`)
    if (s.status === 'FINISHED' || s.status === 'PUBLISHED') return
    if (s.status === 'ERROR' || s.status === 'EXPIRED') throw new NetworkError(`Threads could not use the media: ${s.error_message ?? s.status}`)
    await new Promise((r) => setTimeout(r, video ? 10_000 : 3000))
  }
  throw new NetworkError('Threads is still processing the media — try again in a few minutes')
}

export const threads: Connector = {
  network: 'THREADS',
  label: 'Threads',
  about: 'Posts with photos or a video',
  setup: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
  enabled: () => Boolean(id() && secret()),
  oauth: {
    pkce: false,
    authUrl: ({ state, redirectUri }) => `${AUTH()}?${form({ client_id: id(), redirect_uri: redirectUri, scope: SCOPES.join(','), response_type: 'code', state })}`,
    async exchange({ code, redirectUri }) {
      const short = await api<{ access_token: string; user_id: string }>(`${GRAPH()}/oauth/access_token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form({ client_id: id(), client_secret: secret(), code, grant_type: 'authorization_code', redirect_uri: redirectUri }),
      }, 'Threads')
      const long = await api<{ access_token: string; expires_in: number }>(`${GRAPH()}/access_token?${form({ grant_type: 'th_exchange_token', client_secret: secret(), access_token: short.access_token })}`, {}, 'Threads')
      const me = await g<{ id: string; username: string; name?: string; threads_profile_picture_url?: string }>(
        `me?${form({ fields: 'id,username,name,threads_profile_picture_url', access_token: long.access_token })}`,
      )
      return [
        {
          externalId: me.id,
          name: me.name || me.username,
          handle: me.username,
          avatarUrl: me.threads_profile_picture_url ?? null,
          token: long.access_token,
          expiresAt: new Date(Date.now() + long.expires_in * 1000),
          scopes: SCOPES,
        },
      ]
    },
  },
  // Refreshed a week before the 60 days run out (allowed once it is a day old).
  refreshWithAccess: true,
  refreshAheadMs: 7 * DAY,
  async refresh(_, token) {
    const t = await api<{ access_token: string; expires_in: number }>(`${GRAPH()}/refresh_access_token?${form({ grant_type: 'th_refresh_token', access_token: token })}`, {}, 'Threads')
    return { token: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) }
  },
  check: (out) => (out.text.length > 500 ? 'Threads posts are up to 500 characters' : out.images.length > 20 ? 'Threads takes up to 20 photos' : null),
  async publish(a, token, out) {
    const user = a.externalId
    let container: string
    if (out.video) {
      container = (await post<{ id: string }>(`${user}/threads`, token, { media_type: 'VIDEO', video_url: out.video.url, text: out.text })).id
      await ready(container, token, true)
    } else if (out.images.length === 1) {
      container = (await post<{ id: string }>(`${user}/threads`, token, { media_type: 'IMAGE', image_url: out.images[0].url, text: out.text })).id
      await ready(container, token, false)
    } else if (out.images.length > 1) {
      const children: string[] = []
      for (const m of out.images.slice(0, 20)) children.push((await post<{ id: string }>(`${user}/threads`, token, { media_type: 'IMAGE', image_url: m.url, is_carousel_item: 'true' })).id)
      for (const c of children) await ready(c, token, false)
      container = (await post<{ id: string }>(`${user}/threads`, token, { media_type: 'CAROUSEL', children: children.join(','), text: out.text })).id
      await ready(container, token, false)
    } else container = (await post<{ id: string }>(`${user}/threads`, token, { media_type: 'TEXT', text: out.text })).id
    const media = await post<{ id: string }>(`${user}/threads_publish`, token, { creation_id: container })
    const p = await g<{ permalink?: string }>(`${media.id}?${form({ fields: 'permalink', access_token: token })}`).catch(() => ({ permalink: undefined }))
    return { id: media.id, permalink: p.permalink ?? (a.handle ? `https://www.threads.net/@${a.handle}` : null) }
  },
  async metrics(_, token, mediaId) {
    const r = await g<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
      `${mediaId}/insights?${form({ metric: 'views,likes,replies,reposts,quotes,shares', access_token: token })}`,
    )
    const v = (n: string) => {
      const row = r.data.find((x) => x.name === n)
      return row?.values?.[0]?.value ?? row?.total_value?.value ?? 0
    }
    const likes = v('likes')
    const comments = v('replies')
    const shares = v('reposts') + v('quotes') + v('shares')
    return { views: v('views'), likes, comments, shares, interactions: likes + comments + shares }
  },
}
