import 'server-only'
import { decrypt, sha256 } from './crypto'
import { graph, MetaError } from './meta'
import { prisma } from './prisma'

// Meta Conversions API: conversions recorded by the Loudpilot Tag (browser,
// server and chat) go to the site's pixel from our server, so ad blockers
// and browser limits don't hide them from Meta's optimisation. Sent every
// minute from the tick, up to 500 per pixel at a time; the event id is
// Meta's dedup key (the same id the tag gives the pixel when mirroring).

const MAX_AGE_MS = 7 * 86_400_000 // Meta refuses older events

type Pending = Awaited<ReturnType<typeof pendingEvents>>[number]

const pendingEvents = (limit: number) =>
  prisma.tagEvent.findMany({
    where: { capi: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: { visit: true, visitor: true },
  })

// The site's own CAPI token, else a connected Meta ad account's.
async function tokenFor(site: { workspaceId: string; capiTokenEnc: string | null }) {
  if (site.capiTokenEnc) return decrypt(site.capiTokenEnc)
  const acc = await prisma.socialAccount.findFirst({
    where: { workspaceId: site.workspaceId, network: 'META_ADS', status: 'ACTIVE', accessTokenEnc: { not: null } },
    orderBy: { updatedAt: 'desc' },
  })
  return acc?.accessTokenEnc ? decrypt(acc.accessTokenEnc) : null
}

// fbclid → "fb.1.<ms>.<fbclid>" when the browser had no _fbc cookie.
const fbcOf = (v: Pending['visit']) => v?.fbc ?? (v?.clickKind === 'fbclid' && v.clickId ? `fb.1.${v.startedAt.getTime()}.${v.clickId}` : undefined)

export function capiEvent(e: Pending) {
  const props = (e.props ?? {}) as Record<string, unknown>
  const { _em, _ph, ...custom } = props
  const em = e.visitor?.emailHash ?? (typeof _em === 'string' ? _em : undefined)
  const ph = e.visitor?.phoneHash ?? (typeof _ph === 'string' ? _ph : undefined)
  const userData: Record<string, unknown> = {
    ...(em ? { em: [em] } : {}),
    ...(ph ? { ph: [ph] } : {}),
    ...(e.visitor ? { external_id: [sha256(e.visitor.cookieId)] } : {}),
    ...(e.ip ? { client_ip_address: e.ip } : {}),
    ...(e.visit?.userAgent ? { client_user_agent: e.visit.userAgent } : {}),
    ...(fbcOf(e.visit) ? { fbc: fbcOf(e.visit) } : {}),
    ...(e.visit?.fbp ? { fbp: e.visit.fbp } : {}),
    ...(e.visit?.country ? { country: [sha256(e.visit.country.toLowerCase())] } : {}),
  }
  const customData: Record<string, unknown> = { ...custom }
  if (e.value != null) customData.value = e.value
  if (e.currency) customData.currency = e.currency
  return {
    event_name: e.name,
    event_time: Math.floor(e.createdAt.getTime() / 1000),
    event_id: e.eventId,
    action_source: e.source === 'chat' ? 'chat' : e.url || e.visit ? 'website' : 'system_generated',
    ...(e.url ?? e.visit?.landingUrl ? { event_source_url: e.url ?? e.visit?.landingUrl } : {}),
    user_data: userData,
    ...(Object.keys(customData).length ? { custom_data: customData } : {}),
  }
}

export async function forwardConversionsDue(limit = 500) {
  const events = await pendingEvents(limit)
  if (!events.length) return 0
  const bySite = new Map<string, Pending[]>()
  for (const e of events) bySite.set(e.siteId, [...(bySite.get(e.siteId) ?? []), e])
  let sent = 0
  for (const [siteId, list] of bySite) {
    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) continue
    const fail = async (ids: string[], message: string) => {
      await prisma.tagEvent.updateMany({ where: { id: { in: ids } }, data: { capi: 'failed', capiError: message.slice(0, 300), ip: null } })
      await prisma.site.update({ where: { id: siteId }, data: { capiError: message.slice(0, 300) } })
    }
    const stale = list.filter((e) => Date.now() - e.createdAt.getTime() > MAX_AGE_MS)
    if (stale.length) await fail(stale.map((e) => e.id), 'Older than 7 days — Meta no longer accepts it')
    const fresh = list.filter((e) => !stale.includes(e))
    if (!fresh.length) continue
    if (!site.capi || !site.pixelId) {
      await prisma.tagEvent.updateMany({ where: { id: { in: fresh.map((e) => e.id) } }, data: { capi: null, ip: null } })
      continue
    }
    const token = await tokenFor(site)
    if (!token) {
      await fail(fresh.map((e) => e.id), 'No access token: connect a Meta ad account or paste a Conversions API token')
      continue
    }
    try {
      await graph(`${site.pixelId}/events`, {
        token: site.capiTokenEnc ? undefined : token,
        method: 'POST',
        params: {
          data: JSON.stringify(fresh.map(capiEvent)),
          // A pasted dataset token is not tied to our app: no appsecret_proof.
          ...(site.capiTokenEnc ? { access_token: token } : {}),
        },
      })
      await prisma.tagEvent.updateMany({ where: { id: { in: fresh.map((e) => e.id) } }, data: { capi: 'sent', capiError: null, ip: null } })
      if (site.capiError) await prisma.site.update({ where: { id: siteId }, data: { capiError: null } })
      sent += fresh.length
    } catch (e) {
      // Meta unreachable: they stay pending for the next tick.
      if (!(e instanceof MetaError)) {
        console.error('capi unreachable', siteId, e instanceof Error ? e.message : e)
        continue
      }
      console.error('capi failed', siteId, e.message)
      await fail(fresh.map((x) => x.id), e.message)
    }
  }
  return sent
}
