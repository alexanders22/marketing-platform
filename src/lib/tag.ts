import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Prisma, Site, Visitor } from '@prisma/client'
import { z } from 'zod'
import { clientIp } from './client-ip'
import { decrypt, encrypt, sha256 } from './crypto'
import { siteUrl, terminalUrl } from './hosts'
import { prisma } from './prisma'
import { seal, unseal } from './signed'

// Loudpilot Tag: one script on the company website (/t.js) that records
// where each visit came from (UTM, ad click ids, referrer), what the person
// did (pages, calls, forms, purchases), and — once they leave a contact or
// log in — who they are. Conversions go on to Meta (src/lib/capi.ts) and to
// the reports (src/lib/tag-report.ts).

/* ─── Events ───────────────────────────────────────────────────────────── */

// Meta's standard events; anything else is a custom event.
export const STANDARD_EVENTS = [
  'PageView',
  'ViewContent',
  'Search',
  'AddToCart',
  'AddToWishlist',
  'InitiateCheckout',
  'AddPaymentInfo',
  'Purchase',
  'Lead',
  'CompleteRegistration',
  'Contact',
  'Schedule',
  'SubmitApplication',
  'Subscribe',
  'StartTrial',
  'FindLocation',
  'Donate',
  'CustomizeProduct',
] as const

// What counts as "became a customer" in the reports.
export const CONVERSIONS = ['Lead', 'Purchase', 'Contact', 'CompleteRegistration', 'Schedule', 'SubmitApplication', 'Subscribe', 'StartTrial']

// GA4-style names people already use, mapped to the standard ones.
const ALIASES: Record<string, string> = {
  page_view: 'PageView',
  pageview: 'PageView',
  view_item: 'ViewContent',
  search: 'Search',
  add_to_cart: 'AddToCart',
  add_to_wishlist: 'AddToWishlist',
  begin_checkout: 'InitiateCheckout',
  add_payment_info: 'AddPaymentInfo',
  purchase: 'Purchase',
  generate_lead: 'Lead',
  lead: 'Lead',
  sign_up: 'CompleteRegistration',
  contact: 'Contact',
  schedule: 'Schedule',
  subscribe: 'Subscribe',
}

// The stored name of an event, or null when the name is not usable.
export function eventName(raw: string): string | null {
  const name = raw.trim()
  const std = STANDARD_EVENTS.find((s) => s.toLowerCase() === name.toLowerCase())
  if (std) return std
  if (ALIASES[name.toLowerCase()]) return ALIASES[name.toLowerCase()]
  return /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name) ? name : null
}

/* ─── Site and secret ──────────────────────────────────────────────────── */

const newKey = () => `lp_${randomBytes(9).toString('base64url')}`
export const newSecret = () => `lpsec_${randomBytes(24).toString('base64url')}`

// The workspace's tag, created on first use.
export async function ensureSite(workspaceId: string): Promise<Site> {
  const found = await prisma.site.findUnique({ where: { workspaceId } })
  if (found) return found
  return prisma.site.upsert({
    where: { workspaceId },
    create: { workspaceId, key: newKey(), secretEnc: encrypt(newSecret()) },
    update: {},
  })
}

export const siteSecret = (site: Pick<Site, 'secretEnc'>) => decrypt(site.secretEnc)

// The demo shop's pass: the chat works there before it is switched on, and
// its conversations are marked as tests.
export const previewToken = (siteId: string) => seal({ ps: siteId }, 6 * 3600)
export const isPreview = (token: string | null | undefined, siteId: string) => unseal<{ ps: string }>(token)?.ps === siteId

export const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex')

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// Identity verification: the site computes HMAC-SHA256(secret, user_id) on
// its server and passes it as user_hash.
export const verifyUserHash = (secret: string, userId: string, hash: string) => safeEqual(hmac(secret, userId), hash.trim().toLowerCase())

// "t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${body}`)>" — on
// Loudpilot's calls to the company and on the company's server events.
export function signBody(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${hmac(secret, `${t}.${body}`)}`
}

export function verifySignature(secret: string, body: string, header: string | null, toleranceSec = 300) {
  if (!header) return false
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=') as [string, string]))
  const t = Number(parts.t)
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceSec || !parts.v1) return false
  return safeEqual(hmac(secret, `${t}.${body}`), parts.v1.toLowerCase())
}

/* ─── People ───────────────────────────────────────────────────────────── */

export function normEmail(raw: string | null | undefined) {
  const e = (raw ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200 ? e : null
}

// Digits with the country code, as Meta wants them hashed.
export function normPhone(raw: string | null | undefined) {
  const d = (raw ?? '').replace(/\D/g, '').replace(/^00/, '')
  return d.length >= 7 && d.length <= 15 ? d : null
}

export const maskEmail = (e: string) => {
  const [user, domain] = e.split('@')
  return `${user.slice(0, 2)}***@${domain}`
}
export const maskPhone = (p: string) => `+${p.slice(0, Math.max(0, p.length - 7))}*****${p.slice(-2)}`

export type Identity = { user_id?: string; user_hash?: string; email?: string; phone?: string; name?: string }

// Saves who the visitor is. A user id counts only with a valid user_hash;
// the result says whether it was verified.
export async function applyIdentity(site: Site, visitor: Visitor, id: Identity): Promise<{ verified: boolean; visitor: Visitor }> {
  const data: Prisma.VisitorUpdateInput = {}
  let verified = false
  if (id.user_id && id.user_hash) {
    verified = verifyUserHash(siteSecret(site), String(id.user_id), String(id.user_hash))
    if (verified) data.userId = String(id.user_id).slice(0, 120)
  }
  const email = normEmail(id.email)
  const phone = normPhone(id.phone)
  if (email) data.emailHash = sha256(email)
  if (phone) data.phoneHash = sha256(phone)
  if (email || phone) data.contact = [email && maskEmail(email), phone && maskPhone(phone)].filter(Boolean).join(' · ')
  if (id.name?.trim()) data.name = id.name.trim().slice(0, 80)
  if (Object.keys(data).length === 0) return { verified, visitor }
  return { verified, visitor: await prisma.visitor.update({ where: { id: visitor.id }, data }) }
}

/* ─── Where a visit came from ──────────────────────────────────────────── */

export type Source = {
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  clickKind: string | null
  clickId: string | null
}

const CLICK_IDS: [param: string, source: string, medium: string][] = [
  ['gclid', 'google', 'cpc'],
  ['gbraid', 'google', 'cpc'],
  ['wbraid', 'google', 'cpc'],
  ['msclkid', 'bing', 'cpc'],
  ['ttclid', 'tiktok', 'paid'],
  // Meta adds fbclid to every link people open from Facebook / Instagram,
  // ads or not: without UTM it only says "came from Meta".
  ['fbclid', 'facebook', 'social'],
]

const REFERRERS: [RegExp, string, string][] = [
  [/(^|\.)google\./, 'google', 'organic'],
  [/(^|\.)bing\.com$/, 'bing', 'organic'],
  [/(^|\.)yandex\./, 'yandex', 'organic'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo', 'organic'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'facebook', 'social'],
  [/(^|\.)instagram\.com$/, 'instagram', 'social'],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, 'x', 'social'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin', 'social'],
  [/(^|\.)tiktok\.com$/, 'tiktok', 'social'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube', 'social'],
  [/(^|\.)(t\.me|telegram\.org)$/, 'telegram', 'social'],
  [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, 'chatgpt', 'ai'],
  [/(^|\.)perplexity\.ai$/, 'perplexity', 'ai'],
  [/(^|\.)(gemini\.google\.com|claude\.ai|copilot\.microsoft\.com)$/, 'ai assistant', 'ai'],
]

const cut = (v: string | null | undefined, n = 200) => (v ? v.trim().slice(0, n) || null : null)

export function parseSource(landingUrl: string, referrer: string | null | undefined): Source {
  const out: Source = { source: null, medium: null, campaign: null, content: null, term: null, clickKind: null, clickId: null }
  let url: URL | null = null
  try {
    url = new URL(landingUrl)
  } catch {
    // Unparseable landing page: referrer only.
  }
  const q = url?.searchParams
  if (q) {
    out.source = cut(q.get('utm_source'))?.toLowerCase() ?? null
    out.medium = cut(q.get('utm_medium'))?.toLowerCase() ?? null
    out.campaign = cut(q.get('utm_campaign'))
    out.content = cut(q.get('utm_content'))
    out.term = cut(q.get('utm_term'))
    for (const [param, source, medium] of CLICK_IDS) {
      const v = q.get(param)
      if (!v) continue
      out.clickKind = param
      out.clickId = v.slice(0, 500)
      out.source ??= source
      out.medium ??= medium
      break
    }
  }
  if (!out.source && referrer) {
    try {
      const ref = new URL(referrer)
      if (url && ref.hostname.replace(/^www\./, '') === url.hostname.replace(/^www\./, '')) return out
      const hit = REFERRERS.find(([re]) => re.test(ref.hostname))
      out.source = hit ? hit[1] : ref.hostname.replace(/^www\./, '')
      out.medium = hit ? hit[2] : 'referral'
    } catch {
      // Not a URL: direct.
    }
  }
  return out
}

const PAID = ['cpc', 'ppc', 'paid', 'paid_social', 'paidsocial', 'paid-social', 'ads', 'ad', 'cpm', 'display', 'cpa']
// A visit from an ad: a paid medium or an ad network's click id.
export const isPaid = (v: { medium: string | null; clickKind: string | null }) =>
  PAID.includes(v.medium ?? '') || ['gclid', 'gbraid', 'wbraid', 'msclkid', 'ttclid'].includes(v.clickKind ?? '')

export const isDirect = (v: { source: string | null }) => !v.source

export function deviceOf(ua: string) {
  if (/iPad|Tablet/i.test(ua)) return 'tablet'
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile'
  return 'desktop'
}

// Crawlers and link previews. Headless Chrome counts as a bot in production
// only (the e2e tests drive one).
export function isBot(ua: string) {
  if (!ua) return true
  if (/bot|crawl|spider|slurp|lighthouse|facebookexternalhit|python-requests|curl\/|wget|axios|node-fetch|go-http-client/i.test(ua)) return true
  return process.env.NODE_ENV === 'production' && /HeadlessChrome|PhantomJS/i.test(ua)
}

const hostOf = (origin: string | null) => {
  try {
    return origin ? new URL(origin).hostname.toLowerCase() : null
  } catch {
    return null
  }
}

// A request from Loudpilot's own pages (the demo shop).
export const fromLoudpilot = (origin: string | null) => {
  const host = hostOf(origin)
  return !!host && [siteUrl(), terminalUrl()].some((u) => new URL(u).hostname === host)
}

// Events are accepted from the site's own domains (and their subdomains),
// and from Loudpilot itself (the test shop).
export function hostAllowed(domains: string[], origin: string | null) {
  if (!origin) return domains.length === 0
  const host = hostOf(origin)
  if (!host) return false
  if (fromLoudpilot(origin)) return true
  if (domains.length === 0) return true
  return domains.some((d) => host === d || host.endsWith(`.${d}`))
}

// "https://www.Shop.ge/path" → "shop.ge".
export function cleanDomain(raw: string) {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  try {
    const host = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, '')
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || host === 'localhost' ? host : null
  } catch {
    return null
  }
}

/* ─── Recording ────────────────────────────────────────────────────────── */

// Event properties: a small flat-ish object (stored only up to 3000 chars of JSON).
const props = z.record(z.string().max(100), z.unknown()).refine((p) => Object.keys(p).length <= 50, 'At most 50 properties')

// The company's own user id: up to 200 characters (the first 120 are stored).
const userId = z.union([z.string().max(200), z.number()]).transform(String)

export const browserEvent = z.object({
  n: z.string().max(60),
  id: z.string().min(6).max(64),
  u: z.string().max(2000).optional(),
  t: z.string().max(300).optional(),
  val: z.number().finite().optional(),
  cur: z.string().max(3).optional(),
  p: props.optional(),
})

export const identity = z.object({
  user_id: userId.optional(),
  user_hash: z.string().max(128).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  name: z.string().max(120).optional(),
})

// What /t.js sends (see src/lib/tag-script.ts).
export const collectBody = z.object({
  s: z.string().max(40),
  v: z.string().min(8).max(64),
  sid: z.string().min(8).max(64),
  test: z.boolean().optional(),
  ctx: z
    .object({
      url: z.string().max(2000),
      ref: z.string().max(2000).optional(),
      fbp: z.string().max(200).optional(),
      fbc: z.string().max(600).optional(),
    })
    .optional(),
  e: z.array(browserEvent).max(50),
  id: identity.optional(),
})

export type CollectBody = z.infer<typeof collectBody>
export type RequestMeta = { ip: string | null; ua: string; country: string | null }

// Small JSON for the props column (Meta's custom_data, order ids…).
function cleanProps(p: Record<string, unknown> | undefined) {
  if (!p) return undefined
  const json = JSON.stringify(p)
  return json.length <= 3000 ? (JSON.parse(json) as Prisma.InputJsonValue) : undefined
}

const currency = (c: string | undefined) => (c && /^[A-Za-z]{3}$/.test(c) ? c.toUpperCase() : null)

// Whether an event goes on to Meta's Conversions API.
export const forwards = (site: Pick<Site, 'capi' | 'capiEvents'>, name: string, test: boolean) => site.capi && !test && site.capiEvents.includes(name)

// Saves one batch from the browser: the visitor, the visit (created on its
// first event, with where it came from) and the events.
export async function recordBatch(site: Site, b: CollectBody, meta: RequestMeta) {
  const now = new Date()
  const test = Boolean(b.test)
  let visitor = await prisma.visitor.upsert({
    where: { siteId_cookieId: { siteId: site.id, cookieId: b.v } },
    create: { siteId: site.id, cookieId: b.v },
    update: { lastSeenAt: now },
  })
  let visit = await prisma.visit.findUnique({ where: { siteId_sid: { siteId: site.id, sid: b.sid } } })
  if (!visit) {
    const landing = (b.ctx?.url ?? b.e[0]?.u ?? '').slice(0, 2000)
    visit = await prisma.visit
      .create({
        data: {
          siteId: site.id,
          visitorId: visitor.id,
          sid: b.sid,
          landingUrl: landing,
          referrer: b.ctx?.ref?.slice(0, 1000) || null,
          ...parseSource(landing, b.ctx?.ref),
          fbc: b.ctx?.fbc ?? null,
          fbp: b.ctx?.fbp ?? null,
          userAgent: meta.ua.slice(0, 400),
          device: deviceOf(meta.ua),
          country: meta.country,
          test,
        },
      })
      // Two batches of a new visit at once: the other one created it.
      .catch(() => prisma.visit.findUniqueOrThrow({ where: { siteId_sid: { siteId: site.id, sid: b.sid } } }))
  } else if ((b.ctx?.fbc && !visit.fbc) || (b.ctx?.fbp && !visit.fbp)) {
    visit = await prisma.visit.update({ where: { id: visit.id }, data: { fbc: visit.fbc ?? b.ctx?.fbc, fbp: visit.fbp ?? b.ctx?.fbp } })
  }
  if (b.id) visitor = (await applyIdentity(site, visitor, b.id)).visitor

  const rows: Prisma.TagEventCreateManyInput[] = []
  for (const e of b.e) {
    const name = eventName(e.n)
    if (!name) continue
    const fwd = forwards(site, name, test)
    rows.push({
      siteId: site.id,
      visitId: visit.id,
      visitorId: visitor.id,
      name,
      eventId: e.id,
      source: 'web',
      url: e.u?.slice(0, 1000) ?? null,
      title: e.t?.slice(0, 300) ?? null,
      value: e.val ?? null,
      currency: currency(e.cur),
      props: cleanProps(e.p),
      test,
      capi: fwd ? 'pending' : null,
      ip: fwd ? meta.ip : null,
    })
  }
  if (rows.length) await prisma.tagEvent.createMany({ data: rows, skipDuplicates: true })
  const pages = rows.filter((r) => r.name === 'PageView').length
  await prisma.visit.update({ where: { id: visit.id }, data: { lastAt: now, ...(pages ? { pages: { increment: pages } } : {}) } })
  if (!site.lastEventAt || now.getTime() - site.lastEventAt.getTime() > 60_000) {
    await prisma.site.update({ where: { id: site.id }, data: { lastEventAt: now } })
  }
  return { visitor, visit }
}

// An event the company's server (or the chat) reports — "order paid",
// "deal won". It is tied to the person by their Loudpilot visitor id (the
// _lp_id cookie), the company's user id, or email / phone, and credited to
// their latest visit.
export const serverEvent = z.object({
  name: z.string().max(60),
  event_id: z.string().min(1).max(64).optional(),
  time: z.number().int().positive().optional(),
  visitor_id: z.string().max(64).optional(),
  user_id: userId.optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  name_of_person: z.string().max(120).optional(),
  value: z.number().finite().optional(),
  currency: z.string().max(3).optional(),
  url: z.string().max(2000).optional(),
  ip: z.string().max(64).optional(),
  properties: props.optional(),
})
export type ServerEvent = z.infer<typeof serverEvent>

export async function findVisitor(siteId: string, e: { visitor_id?: string; user_id?: string; email?: string; phone?: string }) {
  if (e.visitor_id) {
    const v = await prisma.visitor.findUnique({ where: { siteId_cookieId: { siteId, cookieId: e.visitor_id } } })
    if (v) return v
  }
  const email = normEmail(e.email)
  const phone = normPhone(e.phone)
  const or: Prisma.VisitorWhereInput[] = [
    ...(e.user_id ? [{ userId: e.user_id }] : []),
    ...(email ? [{ emailHash: sha256(email) }] : []),
    ...(phone ? [{ phoneHash: sha256(phone) }] : []),
  ]
  if (!or.length) return null
  return prisma.visitor.findFirst({ where: { siteId, OR: or }, orderBy: { lastSeenAt: 'desc' } })
}

export async function recordServerEvents(site: Site, events: ServerEvent[], source: 'server' | 'chat' = 'server') {
  const results: { event_id: string; status: 'recorded' | 'duplicate' | 'invalid'; matched: boolean }[] = []
  for (const e of events) {
    const name = eventName(e.name)
    const eventId = e.event_id ?? randomBytes(12).toString('hex')
    if (!name) {
      results.push({ event_id: eventId, status: 'invalid', matched: false })
      continue
    }
    let visitor = await findVisitor(site.id, e)
    // Remember what we learned about the person (helps match later events).
    if (visitor && (e.email || e.phone || e.name_of_person)) visitor = (await applyIdentity(site, visitor, { email: e.email, phone: e.phone, name: e.name_of_person })).visitor
    const visit = visitor ? await prisma.visit.findFirst({ where: { visitorId: visitor.id }, orderBy: { startedAt: 'desc' } }) : null
    const test = visit?.test ?? false
    const fwd = forwards(site, name, test)
    const at = e.time ? new Date(Math.min(e.time * 1000, Date.now())) : new Date()
    const created = await prisma.tagEvent.createMany({
      data: [
        {
          siteId: site.id,
          visitId: visit?.id ?? null,
          visitorId: visitor?.id ?? null,
          name,
          eventId,
          source,
          url: e.url?.slice(0, 1000) ?? null,
          value: e.value ?? null,
          currency: currency(e.currency),
          props: {
            ...((cleanProps(e.properties) as Record<string, unknown> | undefined) ?? {}),
            // Hashes for Meta when the visitor is not known (yet).
            ...(!visitor && normEmail(e.email) ? { _em: sha256(normEmail(e.email)!) } : {}),
            ...(!visitor && normPhone(e.phone) ? { _ph: sha256(normPhone(e.phone)!) } : {}),
          } as Prisma.InputJsonValue,
          test,
          capi: fwd ? 'pending' : null,
          ip: fwd ? (e.ip ?? null) : null,
          createdAt: at,
        },
      ],
      skipDuplicates: true,
    })
    results.push({ event_id: eventId, status: created.count ? 'recorded' : 'duplicate', matched: Boolean(visitor) })
  }
  if (results.some((r) => r.status === 'recorded')) await prisma.site.update({ where: { id: site.id }, data: { lastEventAt: new Date() } })
  return results
}

// The client IP and country behind our proxy.
export function requestMeta(req: Request): RequestMeta {
  const country = req.headers.get('cf-ipcountry') || req.headers.get('x-vercel-ip-country') || null
  return { ip: clientIp(req.headers), ua: req.headers.get('user-agent') ?? '', country: country && /^[A-Z]{2}$/.test(country) ? country : null }
}

// CORS for the browser endpoints: any site may call them (the key and the
// domain list decide what is accepted); no cookies are sent.
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
}

export const corsJson = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { ...CORS, ...headers } })
