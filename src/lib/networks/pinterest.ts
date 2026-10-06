import 'server-only'
import type { SocialAccount } from '@prisma/client'
import { api, basic, form, NetworkError, type Connector } from './types'

// Pinterest API v5: pins with an image (or 2–5), or a video, on a board the
// company picks in Channels. Trial access keeps pins visible to their author
// only; PINTEREST_API_URL can point at the sandbox.

const AUTH = () => process.env.PINTEREST_AUTH_URL || 'https://www.pinterest.com/oauth/'
const API = () => (process.env.PINTEREST_API_URL || 'https://api.pinterest.com/v5').replace(/\/$/, '')
const id = () => process.env.PINTEREST_APP_ID || ''
const secret = () => process.env.PINTEREST_APP_SECRET || ''
const SCOPES = ['user_accounts:read', 'boards:read', 'boards:write', 'pins:read', 'pins:write']

type TokenRes = { access_token: string; refresh_token?: string; expires_in: number; refresh_token_expires_in?: number; scope?: string }
const token = (body: Record<string, string>) =>
  api<TokenRes>(`${API()}/oauth/token`, { method: 'POST', headers: { authorization: basic(id(), secret()), 'content-type': 'application/x-www-form-urlencoded' }, body: form(body) }, 'Pinterest')
const tokens = (t: TokenRes) => ({
  token: t.access_token,
  refresh: t.refresh_token ?? null,
  expiresAt: new Date(Date.now() + t.expires_in * 1000),
  refreshExpiresAt: t.refresh_token_expires_in ? new Date(Date.now() + t.refresh_token_expires_in * 1000) : null,
})
const call = <T>(path: string, t: string, init: RequestInit = {}) =>
  api<T>(`${API()}/${path}`, { ...init, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', ...(init.headers ?? {}) } }, 'Pinterest')

export type Board = { id: string; name: string }
export const boardsOf = (a: Pick<SocialAccount, 'meta'>) => ((a.meta ?? {}) as { boards?: Board[] }).boards ?? []
export const boardOf = (a: Pick<SocialAccount, 'meta'>) => ((a.meta ?? {}) as { board?: string }).board ?? boardsOf(a)[0]?.id ?? null

async function listBoards(t: string) {
  const out: Board[] = []
  let bookmark: string | null = null
  for (let i = 0; i < 5; i++) {
    const r: { items: { id: string; name: string }[]; bookmark?: string | null } = await call(`boards?page_size=100${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ''}`, t)
    out.push(...r.items.map((b) => ({ id: b.id, name: b.name })))
    if (!r.bookmark) break
    bookmark = r.bookmark
  }
  return out
}

async function uploadVideo(t: string, file: Buffer, mime: string) {
  const reg = await call<{ media_id: string; upload_url: string; upload_parameters: Record<string, string> }>('media', t, { method: 'POST', body: JSON.stringify({ media_type: 'video' }) })
  const f = new FormData()
  for (const [k, v] of Object.entries(reg.upload_parameters)) f.set(k, v)
  f.set('file', new Blob([new Uint8Array(file)], { type: mime }))
  const up = await fetch(reg.upload_url, { method: 'POST', body: f, signal: AbortSignal.timeout(300_000) })
  if (!up.ok) throw new NetworkError(`Pinterest video upload failed (${up.status})`)
  for (let i = 0; i < 40; i++) {
    const s = await call<{ status: string }>(`media/${reg.media_id}`, t)
    if (s.status === 'succeeded') return reg.media_id
    if (s.status === 'failed') throw new NetworkError('Pinterest could not process the video')
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new NetworkError('Pinterest is still processing the video — try again later')
}

export const pinterest: Connector = {
  network: 'PINTEREST',
  label: 'Pinterest',
  about: 'Pins with photos or a video, linking to your site',
  setup: ['PINTEREST_APP_ID', 'PINTEREST_APP_SECRET'],
  enabled: () => Boolean(id() && secret()),
  oauth: {
    pkce: false,
    authUrl: ({ state, redirectUri }) => `${AUTH()}?${form({ client_id: id(), redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(','), state })}`,
    async exchange({ code, redirectUri }) {
      const t = await token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, continuous_refresh: 'true' })
      const me = await call<{ username: string; profile_image?: string; business_name?: string }>('user_account', t.access_token)
      const boards = await listBoards(t.access_token)
      return [
        {
          externalId: me.username,
          name: me.business_name || me.username,
          handle: me.username,
          avatarUrl: me.profile_image ?? null,
          meta: { boards, board: boards[0]?.id ?? null },
          ...tokens(t),
          scopes: (t.scope ?? SCOPES.join(',')).split(/[ ,]+/),
        },
      ]
    },
  },
  refreshAheadMs: 3 * 86_400_000,
  refresh: async (_, refresh) => tokens(await token({ grant_type: 'refresh_token', refresh_token: refresh })),
  check: (out) => (!out.video && out.images.length === 0 ? 'Pinterest needs a photo or a video' : null),
  async publish(a, t, out) {
    const board = boardOf(a)
    if (!board) throw new NetworkError('Pick a Pinterest board for this account in Channels')
    let media_source: Record<string, unknown>
    if (out.video) {
      if (!out.video.poster) throw new NetworkError('Pinterest videos need a cover image — the video has none yet')
      media_source = { source_type: 'video_id', media_id: await uploadVideo(t, await out.video.read(), out.video.mime), cover_image_url: out.video.poster }
    } else if (out.images.length === 1) media_source = { source_type: 'image_url', url: out.images[0].url }
    else media_source = { source_type: 'multiple_image_urls', items: out.images.slice(0, 5).map((m) => ({ url: m.url })) }
    const pin = await call<{ id: string }>('pins', t, {
      method: 'POST',
      body: JSON.stringify({ board_id: board, title: out.title.slice(0, 100), description: out.text.slice(0, 800), ...(out.link ? { link: out.link } : {}), media_source }),
    })
    return { id: pin.id, permalink: `https://www.pinterest.com/pin/${pin.id}/` }
  },
  async metrics(_, t, pinId) {
    const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10)
    const r = await call<Record<string, { summary_metrics?: Record<string, number>; lifetime_metrics?: Record<string, number> }>>(
      `pins/${pinId}/analytics?${form({ start_date: day(89), end_date: day(0), metric_types: 'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK' })}`,
      t,
    )
    const m = Object.values(r)[0]?.summary_metrics ?? Object.values(r)[0]?.lifetime_metrics ?? {}
    const saves = m.SAVE ?? 0
    return { views: m.IMPRESSION ?? 0, saves, interactions: saves + (m.PIN_CLICK ?? 0) + (m.OUTBOUND_CLICK ?? 0) }
  },
}
