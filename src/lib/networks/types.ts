import type { SocialAccount, SocialNetwork } from '@prisma/client'

// A network Loudpilot publishes to besides Facebook/Instagram (those live in
// meta.ts). Each connector says how to connect (OAuth or a form), publish a
// post, refresh its token and read a post's numbers.

export type OutMedia = {
  id: string
  kind: 'IMAGE' | 'VIDEO'
  mime: string
  bytes: number
  width: number | null
  height: number | null
  durationMs: number | null
  // A signed public link the network can fetch.
  url: string
  // Videos: a signed link to a still frame, when there is one.
  poster: string | null
  // The file itself, for networks that need an upload.
  read: () => Promise<Buffer>
}

export type Outgoing = {
  // The post text with call to action and hashtags, for this network.
  text: string
  // A short title (YouTube, Pinterest, TikTok): the first line of the post.
  title: string
  // The call-to-action link (UTM-tagged), when there is one.
  link: string | null
  images: OutMedia[]
  video: OutMedia | null
  // This network's settings from the post (Post.networkOptions[network]).
  options: Record<string, unknown>
}

// Cookie holding the signed OAuth state (and PKCE verifier) while connecting.
export const CONNECT_COOKIE = 'khma_connect'

export type Published = { id: string; permalink: string | null }

// An account found after sign-in, ready to be saved (tokens in plain text
// here; the caller encrypts them).
export type Found = {
  externalId: string
  name: string
  handle?: string | null
  avatarUrl?: string | null
  parentId?: string | null
  meta?: Record<string, unknown>
  token: string
  refresh?: string | null
  expiresAt?: Date | null
  // When the refresh token itself expires.
  refreshExpiresAt?: Date | null
  scopes: string[]
}

export type Tokens = { token: string; refresh?: string | null; expiresAt?: Date | null; refreshExpiresAt?: Date | null }

// An error from a network. `reconnect`: the token is dead or a permission is
// gone — the account needs connecting again.
export class NetworkError extends Error {
  constructor(
    message: string,
    readonly reconnect = false,
    readonly status = 0,
  ) {
    super(message)
  }
}

export type Connector = {
  network: SocialNetwork
  label: string
  // Env vars an admin sets to turn it on (shown when it's off).
  setup: string[]
  enabled: () => boolean
  // What it publishes, for the Channels card.
  about: string
  oauth?: {
    pkce: boolean
    authUrl: (o: { state: string; redirectUri: string; challenge?: string }) => string
    exchange: (o: { code: string; redirectUri: string; verifier?: string }) => Promise<Found[]>
  }
  // Get a new access token. `refreshToken` is the stored refresh token, or the
  // access token itself when `refreshWithAccess` (Threads).
  refresh?: (a: SocialAccount, refreshToken: string) => Promise<Tokens>
  refreshWithAccess?: boolean
  // Refresh this long before expiry (default 5 minutes).
  refreshAheadMs?: number
  // Why this post can't go to this network (e.g. "TikTok needs a video").
  check?: (out: Outgoing) => string | null
  publish: (a: SocialAccount, token: string, out: Outgoing) => Promise<Published>
  metrics?: (a: SocialAccount, token: string, externalId: string) => Promise<Partial<Record<string, number>>>
}

// Fetch JSON from a network API; errors become NetworkError (401/403 → reconnect).
export async function api<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}, name = 'The network'): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 60_000) })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    const b = (body ?? {}) as Record<string, unknown>
    const e = (b.error ?? {}) as Record<string, unknown>
    const msg =
      (typeof b.error === 'string' && (b.error_description as string)) ||
      (e.message as string) ||
      (b.message as string) ||
      (b.detail as string) ||
      (b.description as string) ||
      (typeof b.error === 'string' ? b.error : '') ||
      `${name} error ${res.status}`
    throw new NetworkError(String(msg).slice(0, 400), res.status === 401, res.status)
  }
  return body as T
}

export const form = (o: Record<string, string | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined) q.set(k, v)
  return q
}

export const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`

// The first line of a post, trimmed to `max` characters, as a title.
export const titleOf = (text: string, max: number) => {
  const line = text.split('\n').find((l) => l.trim())?.trim() ?? ''
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}
