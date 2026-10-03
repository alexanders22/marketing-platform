import 'server-only'
import { parse } from 'node-html-parser'
import { aiEnabled, auditBrand, buildCompanyProfile, type BrandAuditData, type CompanyProfile } from './ai'
import { importAds, importPostHistory } from './meta-history'
import { prisma } from './prisma'
import { safeFetchText } from './safe-fetch'
import { isValidTimeZone } from './time'

// The dossier: what Khma knows about a company — its website, its post and
// ad history, and the audit of what worked. Every AI feature reads it.

/* ─── Website ──────────────────────────────────────────────────────────── */

// Pages worth reading first, in several languages.
const PRIORITY = /about|company|service|product|shop|catalog|price|pricing|offer|project|portfolio|contact|team|why|faq|o-nas|uslugi|ceny|kontakt|ჩვენ|სერვის|პროდუქ|ფას|კონტაქ|პროექ/i

function pageText(html: string) {
  const root = parse(html)
  root.querySelectorAll('script,style,noscript,svg,iframe,template').forEach((n) => n.remove())
  const title = root.querySelector('title')?.text.trim() ?? ''
  const desc = root.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
  const text = (root.querySelector('main') ?? root.querySelector('body') ?? root).text.replace(/\s+/g, ' ').trim()
  return [title, desc, text].filter(Boolean).join('\n').slice(0, 7000)
}

export async function crawlSite(website: string, maxPages = 8) {
  const start = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`)
  const first = await safeFetchText(start.toString())
  const base = new URL(first.url)
  const out = [{ url: first.url, text: pageText(first.text) }]
  const links = [
    ...new Set(
      parse(first.text)
        .querySelectorAll('a[href]')
        .map((a) => {
          try {
            const u = new URL(a.getAttribute('href')!, base)
            u.hash = ''
            return u.host === base.host && /^https?:$/.test(u.protocol) && !/\.(pdf|jpe?g|png|gif|webp|zip|mp4)$/i.test(u.pathname) ? u.toString() : null
          } catch {
            return null
          }
        })
        .filter((u): u is string => Boolean(u) && u !== first.url && u !== `${first.url}/`),
    ),
  ].sort((a, b) => Number(PRIORITY.test(b)) - Number(PRIORITY.test(a)) || a.length - b.length)

  for (const url of links.slice(0, maxPages - 1)) {
    try {
      const r = await safeFetchText(url, { timeoutMs: 6000, maxBytes: 1_000_000 })
      const text = pageText(r.text)
      if (text.length > 200) out.push({ url: r.url, text })
    } catch {
      // A page we cannot read is skipped.
    }
  }
  return out
}

export async function refreshProfile(workspaceId: string) {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { brandKit: true } })
  if (!ws.brandKit?.website) throw new Error('Add the company website in Brand first')
  const pages = await crawlSite(ws.brandKit.website)
  const profile = await buildCompanyProfile(ws.name, pages)
  await prisma.brandProfile.upsert({
    where: { workspaceId },
    create: { workspaceId, data: profile, sources: pages.map((p) => p.url) },
    update: { data: profile, sources: pages.map((p) => p.url) },
  })
  // Fill empty brand fields; never overwrite what the owner wrote.
  await prisma.brandKit.update({
    where: { workspaceId },
    data: {
      ...(!ws.brandKit.description && profile.summary ? { description: profile.summary } : {}),
      ...(!ws.brandKit.audience && profile.audiences.length ? { audience: profile.audiences.map((a) => `${a.name}: ${a.description}`).join('\n') } : {}),
      ...(!ws.brandKit.voice && profile.tone ? { voice: profile.tone } : {}),
    },
  })
  return profile
}

/* ─── Stats ────────────────────────────────────────────────────────────── */

type M = { reach?: number; views?: number; likes?: number; comments?: number; shares?: number; saves?: number; engagements?: number }

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const round = (v: number | null, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d)
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function localParts(d: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]),
  )
  return { weekday: p.weekday as string, hour: Number(p.hour) }
}

// The ad account's zone if there is one, else a guess from the locale.
export async function workspaceTimeZone(workspaceId: string) {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { locale: true } })
  const adAcc = await prisma.socialAccount.findFirst({ where: { workspaceId, network: 'META_ADS' }, select: { meta: true } })
  const tzRaw = (adAcc?.meta as { timeZone?: string } | null)?.timeZone
  return tzRaw && isValidTimeZone(tzRaw) ? tzRaw : ws.locale === 'ka' ? 'Asia/Tbilisi' : 'UTC'
}

export async function computeStats(workspaceId: string, now = new Date()) {
  const tz = await workspaceTimeZone(workspaceId)

  // Posts younger than two days are still collecting reach.
  const posts = await prisma.socialPost.findMany({
    where: { workspaceId, publishedAt: { gte: new Date(now.getTime() - 365 * 86_400_000), lte: new Date(now.getTime() - 2 * 86_400_000) } },
    orderBy: { publishedAt: 'desc' },
  })

  // Each post scored against its network's average, so Facebook and
  // Instagram can be compared.
  const byNet = new Map<string, number>()
  for (const net of ['FACEBOOK', 'INSTAGRAM']) {
    byNet.set(net, avg(posts.filter((p) => p.network === net).map((p) => (p.metrics as M).engagements ?? 0)) ?? 0)
  }
  const scored = posts.map((p) => {
    const m = p.metrics as M
    const base = byNet.get(p.network) || 1
    return {
      p,
      m,
      score: (m.engagements ?? 0) / base,
      er: m.reach ? (m.engagements ?? 0) / m.reach : null,
      tags: (p.text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length,
      len: p.text.replace(/#[\p{L}\p{N}_]+/gu, '').trim().length,
    }
  })

  const group = <K extends string>(key: (s: (typeof scored)[number]) => K) => {
    const g = new Map<K, typeof scored>()
    for (const s of scored) g.set(key(s), [...(g.get(key(s)) ?? []), s])
    return [...g.entries()]
      .map(([k, list]) => ({
        key: k,
        posts: list.length,
        index: round(avg(list.map((s) => s.score))),
        avgReach: round(avg(list.map((s) => s.m.reach).filter((v): v is number => typeof v === 'number')), 0),
        engagementRate: round(avg(list.map((s) => s.er).filter((v): v is number => v !== null)), 4),
      }))
      .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
  }

  const lenBucket = (n: number) => (n < 100 ? 'under 100 chars' : n < 300 ? '100–300 chars' : n < 800 ? '300–800 chars' : 'over 800 chars')
  const tagBucket = (n: number) => (n === 0 ? 'no hashtags' : n <= 5 ? '1–5 hashtags' : n <= 15 ? '6–15 hashtags' : 'over 15 hashtags')
  const hourBucket = (h: number) => (h < 9 ? 'night/early (0–9)' : h < 12 ? 'morning (9–12)' : h < 15 ? 'midday (12–15)' : h < 18 ? 'afternoon (15–18)' : h < 21 ? 'evening (18–21)' : 'late (21–24)')

  // Weekly rhythm over the last 12 weeks.
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const to = now.getTime() - i * 7 * 86_400_000
    return posts.filter((p) => p.publishedAt.getTime() <= to && p.publishedAt.getTime() > to - 7 * 86_400_000).length
  }).reverse()

  const brief = (s: (typeof scored)[number]) => ({
    network: s.p.network,
    format: s.p.format,
    date: s.p.publishedAt.toISOString().slice(0, 10),
    text: s.p.text.slice(0, 280),
    reach: s.m.reach ?? null,
    engagements: s.m.engagements ?? 0,
    index: round(s.score),
  })
  const ranked = [...scored].sort((a, b) => b.score - a.score)

  // Ads: creatives with enough spend to judge, by cost per result.
  const ads = await prisma.adItem.findMany({ where: { campaign: { workspaceId } }, include: { campaign: { select: { name: true, objective: true, currency: true } } } })
  // Reach campaigns are left out: a cost per person reached is not
  // comparable with a cost per lead or sale.
  const reachObjectives = ['OUTCOME_AWARENESS', 'REACH', 'BRAND_AWARENESS']
  const judged = ads
    .filter((a) => a.spend > 0 && a.impressions >= 500 && !reachObjectives.includes(a.campaign.objective ?? ''))
    .map((a) => ({
      campaign: a.campaign.name,
      objective: a.campaign.objective,
      ad: a.name,
      headline: a.title,
      text: a.body?.slice(0, 280) ?? null,
      cta: a.cta,
      spend: round(a.spend),
      results: a.results,
      costPerResult: a.results ? round(a.spend / a.results) : null,
      ctr: round(a.clicks / a.impressions, 4),
      currency: a.campaign.currency,
    }))
  const withResults = judged.filter((a) => a.costPerResult !== null).sort((a, b) => a.costPerResult! - b.costPerResult!)
  const days = await prisma.adInsightDay.findMany({ where: { campaign: { workspaceId } } })
  const t = days.reduce(
    (s, d) => ({ spend: s.spend + d.spend, impressions: s.impressions + d.impressions, clicks: s.clicks + d.clicks, results: s.results + (d.resultType === 'reach' ? 0 : d.results) }),
    { spend: 0, impressions: 0, clicks: 0, results: 0 },
  )

  return {
    timeZone: tz,
    posts: {
      total: posts.length,
      byNetwork: group((s) => s.p.network),
      byFormat: group((s) => s.p.format),
      byWeekday: group((s) => localParts(s.p.publishedAt, tz).weekday).sort((a, b) => WEEKDAYS.indexOf(a.key) - WEEKDAYS.indexOf(b.key)),
      byTime: group((s) => hourBucket(localParts(s.p.publishedAt, tz).hour)),
      byLength: group((s) => lenBucket(s.len)),
      byHashtags: group((s) => tagBucket(s.tags)),
      postsPerWeek: weeks,
      best: ranked.slice(0, 8).map(brief),
      worst: ranked.length > 10 ? ranked.slice(-6).reverse().map(brief) : [],
    },
    ads: {
      days: days.length,
      spend: round(t.spend),
      results: t.results,
      costPerResult: t.results ? round(t.spend / t.results) : null,
      ctr: t.impressions ? round(t.clicks / t.impressions, 4) : null,
      cpm: t.impressions ? round((t.spend / t.impressions) * 1000) : null,
      bestCreatives: withResults.slice(0, 5),
      worstCreatives: withResults.length > 5 ? withResults.slice(-3).reverse() : [],
    },
  }
}

export type DossierStats = Awaited<ReturnType<typeof computeStats>>

/* ─── Refresh ──────────────────────────────────────────────────────────── */

const running = new Set<string>()

// Automatic audits (after connecting, weekly) can be switched off with
// KHMA_AUTO_AUDIT=off, e.g. on a test server; the Refresh button always audits.
const autoAudit = () => process.env.KHMA_AUTO_AUDIT !== 'off'

// Import history from every connected account, then audit. Safe to call
// again: imports are upserts; one run per workspace at a time.
export async function refreshDossier(workspaceId: string, { profile = false, audit: doAudit = autoAudit() } = {}) {
  if (running.has(workspaceId)) return { skipped: true as const }
  running.add(workspaceId)
  try {
    const accounts = await prisma.socialAccount.findMany({ where: { workspaceId, status: 'ACTIVE' } })
    let imported = 0
    for (const a of accounts) {
      try {
        imported += a.network === 'META_ADS' ? await importAds(a) : await importPostHistory(a)
      } catch (e) {
        console.error('history import failed', a.id, e instanceof Error ? e.message : e)
      }
    }
    if (profile) await refreshProfile(workspaceId).catch((e) => console.error('profile failed', workspaceId, e instanceof Error ? e.message : e))
    const audit = doAudit && aiEnabled() ? await runAudit(workspaceId) : null
    return { imported, audit }
  } finally {
    running.delete(workspaceId)
  }
}

export async function runAudit(workspaceId: string) {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { brandKit: true, brandProfile: true } })
  const stats = await computeStats(workspaceId)
  if (stats.posts.total === 0 && stats.ads.days === 0) return null
  const data = await auditBrand(ws.name, ws.brandKit, (ws.brandProfile?.data as CompanyProfile | undefined) ?? null, stats)
  return prisma.brandAudit.create({ data: { workspaceId, stats, data, postsCount: stats.posts.total } })
}

// Weekly by the ticker: workspaces with connected accounts whose history is
// older than 7 days.
export async function refreshDossiersDue(limit = 5) {
  const due = await prisma.socialAccount.findMany({
    where: {
      status: 'ACTIVE',
      network: { in: ['FACEBOOK', 'INSTAGRAM'] },
      OR: [{ historyAt: null }, { historyAt: { lt: new Date(Date.now() - 7 * 86_400_000) } }],
    },
    distinct: ['workspaceId'],
    select: { workspaceId: true },
    take: limit,
  })
  for (const d of due) await refreshDossier(d.workspaceId).catch((e) => console.error('dossier refresh failed', d.workspaceId, e))
  return due.length
}

/* ─── For prompts ──────────────────────────────────────────────────────── */

// A compact brief every AI feature adds to its prompt.
export async function dossierBrief(workspaceId: string) {
  const [profile, audit] = await Promise.all([
    prisma.brandProfile.findUnique({ where: { workspaceId } }),
    prisma.brandAudit.findFirst({ where: { workspaceId }, orderBy: { createdAt: 'desc' } }),
  ])
  const p = profile?.data as CompanyProfile | undefined
  const a = audit?.data as BrandAuditData | undefined
  const lines: string[] = []
  if (p) {
    lines.push(`Company: ${p.summary}`)
    if (p.offerings.length) lines.push(`Offers: ${p.offerings.map((o) => `${o.name}${o.price ? ` (${o.price})` : ''}`).join('; ')}`)
    if (p.usp.length) lines.push(`Why choose them: ${p.usp.join('; ')}`)
    if (p.audiences.length) lines.push(`Audiences: ${p.audiences.map((x) => `${x.name} — ${x.description}`).join('; ')}`)
    if (p.locations.length) lines.push(`Locations: ${p.locations.join(', ')}`)
    if (p.proof.length) lines.push(`Proof: ${p.proof.join('; ')}`)
  }
  if (a) {
    if (a.works.length) lines.push(`What worked before: ${a.works.map((w) => w.insight).join('; ')}`)
    if (a.doesnt.length) lines.push(`What did not work: ${a.doesnt.map((w) => w.insight).join('; ')}`)
    if (a.avoid.length) lines.push(`Never repeat: ${a.avoid.join('; ')}`)
    if (a.bestTimes) lines.push(`Best times: ${a.bestTimes}`)
    if (a.formats) lines.push(`Formats: ${a.formats}`)
  }
  return lines.join('\n')
}

// The brand as AI functions take it, with the dossier brief attached.
export async function withDossier<T extends object>(brand: T | null, workspaceId: string) {
  const dossier = await dossierBrief(workspaceId)
  return brand ? { ...brand, dossier } : null
}
