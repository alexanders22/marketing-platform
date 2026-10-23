import 'server-only'
import { decrypt } from './crypto'
import { graph, MetaError } from './meta'
import { prisma } from './prisma'

// "You vs competitors" on Instagram. Instagram shows the public numbers of
// business and creator accounts to a connected business account (business
// discovery): followers, posts, and likes and comments per post. Once a day
// each company's own account and its competitors' get a row; the leaderboard
// compares the latest rows and the followers a week before. Reach is private,
// so the ranking is by reactions per post.

const DAY_MS = 86_400_000
const day = (d: Date) => d.toISOString().slice(0, 10)

// "@bloom.ge", "bloom.ge" or "https://instagram.com/bloom.ge/" → "bloom.ge".
export function igUsername(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim().replace(/^@/, '')
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  const u = (m ? m[1] : s).replace(/\/+$/, '').toLowerCase()
  return /^[a-z0-9._]{1,30}$/.test(u) ? u : null
}

type Discovered = {
  business_discovery?: {
    username?: string
    name?: string
    profile_picture_url?: string
    followers_count?: number
    media_count?: number
    media?: { data?: { timestamp?: string; like_count?: number; comments_count?: number }[] }
  }
}

// One account's numbers now, read through the company's own Instagram account.
async function discover(igId: string, token: string, username: string, now: Date) {
  const fields = `business_discovery.username(${username}){username,name,profile_picture_url,followers_count,media_count,media.limit(30){timestamp,like_count,comments_count}}`
  const res = await graph<Discovered>(igId, { token, params: { fields } })
  const b = res.business_discovery
  if (!b) throw new Error('Instagram did not return this account')
  const media = b.media?.data ?? []
  const recent = media.filter((m) => m.timestamp && now.getTime() - Date.parse(m.timestamp.replace(/\+0000$/, 'Z')) <= 30 * DAY_MS)
  // Reactions on the last 30 days' posts, else on the latest 12 posts.
  const sample = recent.length ? recent : media.slice(0, 12)
  const avg = (f: (m: (typeof media)[number]) => number) => (sample.length ? sample.reduce((s, m) => s + f(m), 0) / sample.length : null)
  return {
    name: b.name ?? null,
    avatarUrl: b.profile_picture_url ?? null,
    followers: b.followers_count ?? null,
    mediaCount: b.media_count ?? null,
    posts30: recent.length,
    avgLikes: avg((m) => m.like_count ?? 0),
    avgComments: avg((m) => m.comments_count ?? 0),
  }
}

// Plain reasons Instagram gives for not showing an account.
function reason(e: unknown) {
  if (e instanceof MetaError && (e.code === 110 || e.subcode === 2207013 || /cannot find|not find user|business discovery/i.test(e.message)))
    return 'Not a business or creator account, or no such account — Instagram does not share its numbers.'
  return e instanceof Error ? e.message.slice(0, 300) : 'Instagram did not answer'
}

// Today's row for the company and each competitor with an Instagram. Returns
// false when the company has no Instagram business account connected.
export async function refreshBenchmarks(workspaceId: string, now = new Date()) {
  const ig = await prisma.socialAccount.findFirst({
    where: { workspaceId, network: 'INSTAGRAM', status: 'ACTIVE', accessTokenEnc: { not: null } },
    orderBy: { createdAt: 'asc' },
  })
  if (!ig?.accessTokenEnc) return false
  const token = decrypt(ig.accessTokenEnc)
  const competitors = await prisma.competitor.findMany({ where: { workspaceId, instagram: { not: null } }, select: { id: true, instagram: true } })
  const who = [
    ...(igUsername(ig.handle) ? [{ username: igUsername(ig.handle)!, competitorId: null as string | null }] : []),
    ...competitors.flatMap((c) => (igUsername(c.instagram) ? [{ username: igUsername(c.instagram)!, competitorId: c.id }] : [])),
  ]
  const date = day(now)
  for (const w of who) {
    let data: Awaited<ReturnType<typeof discover>> | null = null
    let error: string | null = null
    try {
      data = await discover(ig.externalId, token, w.username, now)
    } catch (e) {
      error = reason(e)
    }
    const row = { competitorId: w.competitorId, ...(data ?? {}), error }
    await prisma.instagramBenchmark.upsert({
      where: { workspaceId_username_date: { workspaceId, username: w.username, date } },
      create: { workspaceId, username: w.username, date, ...row },
      update: row,
    })
  }
  return true
}

// Once a day per company with an Instagram account and competitors on
// Instagram (a few per tick).
export async function refreshBenchmarksDue(now = new Date(), limit = 10) {
  const today = day(now)
  const due = await prisma.workspace.findMany({
    where: {
      socialAccounts: { some: { network: 'INSTAGRAM', status: 'ACTIVE' } },
      competitors: { some: { instagram: { not: null } } },
      NOT: { instagramBenchmarks: { some: { date: today } } },
    },
    select: { id: true },
    take: limit,
  })
  for (const w of due) await refreshBenchmarks(w.id, now).catch((e) => console.error('benchmarks failed', w.id, e))
  return due.length
}

export type BoardRow = {
  username: string
  name: string
  you: boolean
  followers: number | null
  // Followers gained since the row a week (or more) before.
  growth: number | null
  posts30: number | null
  reactions: number | null
  // Reactions per post per 100 followers.
  engagement: number | null
  error: string | null
}

// The latest numbers of the company and its competitors, best reactions per
// post first. `state` says what is missing when there is nothing to compare.
export async function leaderboard(workspaceId: string) {
  const [ig, competitors] = await Promise.all([
    prisma.socialAccount.findFirst({ where: { workspaceId, network: 'INSTAGRAM', status: 'ACTIVE' }, select: { handle: true, name: true } }),
    prisma.competitor.findMany({ where: { workspaceId }, select: { id: true, name: true, instagram: true } }),
  ])
  const onInstagram = competitors.filter((c) => igUsername(c.instagram))
  if (!ig) return { state: 'connect' as const, rows: [] as BoardRow[], date: null }
  if (onInstagram.length === 0) return { state: 'competitors' as const, rows: [] as BoardRow[], date: null }
  const rows = await prisma.instagramBenchmark.findMany({ where: { workspaceId }, orderBy: { date: 'desc' }, take: 400 })
  const latest = rows[0]?.date ?? null
  if (!latest) return { state: 'pending' as const, rows: [] as BoardRow[], date: null }
  const weekAgo = day(new Date(Date.parse(`${latest}T00:00:00Z`) - 7 * DAY_MS))
  const self = igUsername(ig.handle)
  const names = new Map(competitors.map((c) => [c.id, c.name]))
  const board: BoardRow[] = rows
    .filter((r) => r.date === latest && (r.competitorId === null ? r.username === self : names.has(r.competitorId)))
    .map((r) => {
      const before = rows.find((x) => x.username === r.username && x.date <= weekAgo && x.followers !== null)
      const reactions = r.avgLikes === null ? null : r.avgLikes + (r.avgComments ?? 0)
      return {
        username: r.username,
        name: r.competitorId ? (names.get(r.competitorId) ?? r.username) : (ig.name ?? r.name ?? r.username),
        you: r.competitorId === null,
        followers: r.followers,
        growth: r.followers !== null && before?.followers != null ? r.followers - before.followers : null,
        posts30: r.posts30,
        reactions,
        engagement: reactions !== null && r.followers ? (reactions / r.followers) * 100 : null,
        error: r.error,
      }
    })
    .sort((a, b) => (b.reactions ?? -1) - (a.reactions ?? -1))
  return { state: 'ready' as const, rows: board, date: latest }
}

export type Leaderboard = Awaited<ReturnType<typeof leaderboard>>
