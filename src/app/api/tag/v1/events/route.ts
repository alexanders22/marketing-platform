import { z } from 'zod'
import { ApiError, handler, json } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { overLimit } from '@/lib/rate-limit'
import { readBody } from '@/lib/read-body'
import { recordServerEvents, safeEqual, serverEvent, siteSecret, verifySignature } from '@/lib/tag'

// Server-side events: the company's backend (or Zapier / Make) reports what
// happened outside the browser — an order paid, a deal won, a call booked.
// Auth with the site secret: `Authorization: Bearer lpsec_…`, or a
// signature `X-Loudpilot-Signature: t=…,v1=…` over the raw body.
const schema = z.object({ site: z.string().max(40), events: z.array(serverEvent).min(1).max(100) })

// Up to 100 events with their properties.
const MAX_BYTES = 512 * 1024

export const POST = handler(async (req: Request) => {
  const raw = await readBody(req, MAX_BYTES)
  if (raw === null) throw new ApiError(413, 'too_large', 'The body is larger than 512 KB; send fewer events per request')
  let parsed: z.infer<typeof schema>
  try {
    parsed = schema.parse(JSON.parse(raw))
  } catch (e) {
    if (e instanceof z.ZodError) throw e
    throw new ApiError(400, 'invalid_json', 'Body must be JSON')
  }
  const site = await prisma.site.findUnique({ where: { key: parsed.site }, include: { workspace: { include: { account: { select: { pausedAt: true } } } } } })
  if (!site) throw new ApiError(404, 'unknown_site', 'Unknown site key')
  const secret = siteSecret(site)
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const ok = (bearer && safeEqual(bearer, secret)) || verifySignature(secret, raw, req.headers.get('x-loudpilot-signature'))
  if (!ok) throw new ApiError(401, 'unauthorized', 'Use the site secret as a Bearer token, or sign the body (X-Loudpilot-Signature)')
  if (site.workspace.account?.pausedAt) throw new ApiError(403, 'account_paused', 'This account is paused')
  if (overLimit(`tag-api:${site.id}`, 1200, 60_000)) throw new ApiError(429, 'rate_limited', 'Too many events; at most 1200 requests a minute')
  const results = await recordServerEvents(site, parsed.events)
  return json({ results })
})
