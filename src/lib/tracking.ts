import 'server-only'
import { decrypt } from './crypto'
import { graph } from './meta'
import { prisma } from './prisma'
import { safeFetchText } from './safe-fetch'

// Tracking check: is the Meta Pixel on the website, does it fire, which
// events arrive from the browser and which from the server (Conversions
// API), and are the Google tags there. Each finding comes with the fix.

export type CheckStatus = 'ok' | 'warn' | 'bad' | 'info'
export type Check = { key: string; label: string; status: CheckStatus; detail: string; fix?: string }
export type PixelInfo = { id: string; name: string; lastFired: string | null; web: Record<string, number>; server: Record<string, number> }
export type SiteScan = { pixelIds: string[]; events: string[]; gtm: string[]; ga4: string[]; googleAds: string[]; error?: string }
export type TrackingReport = { url: string | null; site: SiteScan | null; pixels: PixelInfo[]; adAccounts: number; gaConnected: boolean; checks: Check[] }

// Events that tell the ad system someone became a customer.
const CONVERSIONS = ['Lead', 'CompleteRegistration', 'Purchase', 'Contact', 'Schedule', 'SubmitApplication', 'Subscribe', 'StartTrial', 'InitiateCheckout']

const uniq = (xs: string[]) => [...new Set(xs)]

export function scanHtml(html: string): SiteScan {
  const all = (re: RegExp) => uniq([...html.matchAll(re)].map((m) => m[1]))
  return {
    pixelIds: uniq([...all(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{8,20})['"]/g), ...all(/facebook\.com\/tr\?[^"'\s]*\bid=(\d{8,20})/g)]),
    events: all(/fbq\(\s*['"]track(?:Custom)?['"]\s*,\s*['"]([A-Za-z_]+)['"]/g),
    gtm: all(/\b(GTM-[A-Z0-9]{4,10})\b/g),
    ga4: all(/\b(G-[A-Z0-9]{6,12})\b/g),
    googleAds: all(/\b(AW-\d{6,12})\b/g),
  }
}

async function scanSite(url: string): Promise<SiteScan> {
  try {
    const { text } = await safeFetchText(url, { timeoutMs: 10_000, maxBytes: 2_000_000 })
    return scanHtml(text)
  } catch (e) {
    return { pixelIds: [], events: [], gtm: [], ga4: [], googleAds: [], error: e instanceof Error ? e.message : String(e) }
  }
}

type StatsPage = { data: { data?: { value: string; count: number }[] }[] }
const tally = (r: StatsPage) => {
  const out: Record<string, number> = {}
  for (const hour of r.data ?? []) for (const x of hour.data ?? []) out[x.value] = (out[x.value] ?? 0) + Number(x.count)
  return out
}

async function pixelsOf(workspaceId: string) {
  const accounts = await prisma.socialAccount.findMany({ where: { workspaceId, network: 'META_ADS', status: 'ACTIVE' } })
  const pixels = new Map<string, PixelInfo>()
  const since = Math.floor(Date.now() / 1000) - 7 * 86_400
  for (const a of accounts) {
    if (!a.accessTokenEnc) continue
    const token = decrypt(a.accessTokenEnc)
    try {
      const list = await graph<{ data: { id: string; name: string; last_fired_time?: string }[] }>(`${a.externalId}/adspixels`, {
        token,
        params: { fields: 'id,name,last_fired_time' },
      })
      for (const p of list.data) {
        if (pixels.has(p.id)) continue
        const stats = (source: string) =>
          graph<StatsPage>(`${p.id}/stats`, { token, params: { aggregation: 'event', start_time: since, event_source: source } })
            .then(tally)
            .catch(() => ({}))
        const [web, server] = await Promise.all([stats('WEB_ONLY'), stats('SERVER_ONLY')])
        pixels.set(p.id, { id: p.id, name: p.name, lastFired: p.last_fired_time ?? null, web, server })
      }
    } catch (e) {
      console.error('pixel read failed', a.id, e instanceof Error ? e.message : e)
    }
  }
  return { pixels: [...pixels.values()], adAccounts: accounts.length }
}

const sum = (r: Record<string, number>) => Object.values(r).reduce((s, x) => s + x, 0)
const list = (xs: string[]) => xs.join(', ')

export function judge(r: Omit<TrackingReport, 'checks'>, now = new Date()): Check[] {
  const checks: Check[] = []
  const site = r.site
  const onSite = site?.pixelIds ?? []
  const viaGtm = !!site && onSite.length === 0 && site.gtm.length > 0

  // 1. The pixel code on the website.
  if (!r.url) checks.push({ key: 'site', label: 'Website', status: 'bad', detail: 'No website in the Brand kit.', fix: 'Add the website address in Brand → Brand kit.' })
  else if (site?.error) checks.push({ key: 'site', label: 'Website', status: 'bad', detail: `Could not open ${r.url}: ${site.error}`, fix: 'Check the address in the Brand kit and that the site is online.' })
  else if (onSite.length) checks.push({ key: 'pixel-code', label: 'Meta Pixel on the website', status: 'ok', detail: `Pixel ${list(onSite)} is in the page code.` })
  else if (viaGtm)
    checks.push({ key: 'pixel-code', label: 'Meta Pixel on the website', status: 'info', detail: `No pixel in the page code, but Google Tag Manager (${list(site!.gtm)}) is — the pixel may be loaded through it. The numbers below show whether it fires.` })
  else
    checks.push({
      key: 'pixel-code',
      label: 'Meta Pixel on the website',
      status: 'bad',
      detail: 'No Meta Pixel on the home page. Ads can’t learn who becomes a customer, and you can’t retarget visitors.',
      fix: 'Events Manager → Connect data → Web → Meta Pixel, then paste the base code into the <head> of every page (or add it in your site builder / Google Tag Manager).',
    })

  // 2. The pixel belongs to a connected ad account and fires.
  const known = r.pixels.map((p) => p.id)
  if (r.adAccounts === 0) checks.push({ key: 'pixel-account', label: 'Pixel in your ad account', status: 'info', detail: 'Connect your Meta ad account in Channels to check whether the pixel fires and which events arrive.' })
  else if (r.pixels.length === 0)
    checks.push({ key: 'pixel-account', label: 'Pixel in your ad account', status: 'bad', detail: 'The connected ad account has no pixel (dataset).', fix: 'Create one in Events Manager → Connect data → Web, and give the ad account access to it.' })
  else {
    const foreign = onSite.filter((id) => !known.includes(id))
    if (foreign.length)
      checks.push({
        key: 'pixel-account',
        label: 'Pixel in your ad account',
        status: 'warn',
        detail: `The website uses pixel ${list(foreign)}, which the connected ad account can’t see (it has ${list(known)}).`,
        fix: 'Share that pixel with the ad account in Business settings → Data sources → Datasets, or install the ad account’s pixel on the site.',
      })
    for (const p of r.pixels) {
      const hours = p.lastFired ? (now.getTime() - Date.parse(p.lastFired)) / 3_600_000 : Infinity
      checks.push(
        hours <= 24
          ? { key: `fires-${p.id}`, label: `${p.name} fires`, status: 'ok', detail: `Last event ${Math.max(1, Math.round(hours))} h ago; ${sum(p.web).toLocaleString('en-US')} browser events in 7 days.` }
          : {
              key: `fires-${p.id}`,
              label: `${p.name} fires`,
              status: 'bad',
              detail: p.lastFired ? `No events for ${Math.round(hours / 24)} days.` : 'This pixel has never received an event.',
              fix: 'Open the site, then check Events Manager → Test events. If nothing arrives, the code is missing or blocked.',
            },
      )
    }
  }

  // 3. Conversion events (from browser or server).
  const pixels = r.pixels
  const events = uniq([...(site?.events ?? []), ...pixels.flatMap((p) => [...Object.keys(p.web), ...Object.keys(p.server)])])
  const conv = events.filter((e) => CONVERSIONS.includes(e))
  if (pixels.length || onSite.length)
    checks.push(
      conv.length
        ? { key: 'conversions', label: 'Conversion events', status: 'ok', detail: `Tracked: ${list(conv)}.` }
        : {
            key: 'conversions',
            label: 'Conversion events',
            status: 'warn',
            detail: `Only ${events.length ? list(events) : 'page views'} — nothing tells Meta who became a lead or a customer.`,
            fix: "Send a Lead (form sent), CompleteRegistration (sign-up) or Purchase event: fbq('track', 'Lead') on the thank-you page, or set it up in Events Manager → Event setup tool.",
          },
    )

  // 4. Conversions API: the same events from the server.
  if (pixels.length) {
    const server = pixels.reduce((s, p) => s + sum(p.server), 0)
    const web = pixels.reduce((s, p) => s + sum(p.web), 0)
    if (server === 0)
      checks.push({
        key: 'capi',
        label: 'Conversions API (server events)',
        status: 'warn',
        detail: 'No events from your server in 7 days. Browsers with ad blockers and iOS lose 20–40% of browser events, so ads optimise on partial data.',
        fix: 'Turn on the Conversions API: Shopify, WooCommerce and Wix have it built in; for other sites use Events Manager → Settings → Conversions API → "Set up with Gateway" or a server-side Google Tag Manager. Send the same event_id from browser and server so Meta counts each event once.',
      })
    else {
      const both = pixels.flatMap((p) => Object.keys(p.server).filter((e) => p.web[e]))
      checks.push({
        key: 'capi',
        label: 'Conversions API (server events)',
        status: 'ok',
        detail: `${server.toLocaleString('en-US')} server events in 7 days (${Math.round((server / Math.max(1, server + web)) * 100)}% of all).`,
        ...(both.length ? { fix: `${list(uniq(both))} arrive from both browser and server — make sure both send the same event_id, or they are counted twice.` } : {}),
      })
    }
  }

  // 5. Google tags.
  if (site && !site.error) {
    checks.push(
      site.ga4.length || r.gaConnected
        ? { key: 'ga4', label: 'Google Analytics 4', status: 'ok', detail: site.ga4.length ? `Tag ${list(site.ga4)} is on the site${r.gaConnected ? ' and connected to Loudpilot' : ''}.` : 'Connected to Loudpilot.' }
        : viaGtm
          ? { key: 'ga4', label: 'Google Analytics 4', status: 'info', detail: 'No GA4 tag in the page code; it may be loaded through Google Tag Manager.', fix: 'Connect Google Analytics in Channels to see visits next to ad spend.' }
          : { key: 'ga4', label: 'Google Analytics 4', status: 'warn', detail: 'No Google Analytics 4 tag found.', fix: 'Create a GA4 property and add its tag (G-…) to every page, then connect it in Channels.' },
    )
    if (site.googleAds.length) checks.push({ key: 'gads', label: 'Google Ads tag', status: 'ok', detail: `Conversion tag ${list(site.googleAds)} is on the site.` })
  }
  return checks
}

export async function runTrackingCheck(workspaceId: string) {
  const brand = await prisma.brandKit.findUnique({ where: { workspaceId }, select: { website: true } })
  const url = brand?.website ? (/^https?:\/\//.test(brand.website) ? brand.website : `https://${brand.website}`) : null
  const [site, px, ga] = await Promise.all([
    url ? scanSite(url) : Promise.resolve(null),
    pixelsOf(workspaceId),
    prisma.socialAccount.count({ where: { workspaceId, network: 'GOOGLE_ANALYTICS', status: 'ACTIVE' } }),
  ])
  const base = { url, site, pixels: px.pixels, adAccounts: px.adAccounts, gaConnected: ga > 0 }
  const report: TrackingReport = { ...base, checks: judge(base) }
  await prisma.websiteAudit.create({ data: { workspaceId, kind: 'TRACKING', url, result: report } })
  return report
}
