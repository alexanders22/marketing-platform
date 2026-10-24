import { prisma } from '@/lib/prisma'
import { overLimit } from '@/lib/rate-limit'
import { readBody, tooLarge } from '@/lib/read-body'
import { collectBody, CORS, hostAllowed, isBot, recordBatch, requestMeta } from '@/lib/tag'

// Events from /t.js (sendBeacon, text/plain so no preflight). Always 204 for
// the browser; what was refused is only logged on our side.
const done = () => new Response(null, { status: 204, headers: CORS })

export async function POST(req: Request) {
  const meta = requestMeta(req)
  if (isBot(meta.ua)) return done()
  if (overLimit(`tag:${meta.ip ?? 'unknown'}`, 600, 60_000)) return new Response(null, { status: 429, headers: CORS })
  const raw = await readBody(req)
  if (raw === null) return tooLarge(CORS)
  let parsed
  try {
    parsed = collectBody.safeParse(JSON.parse(raw))
  } catch {
    return new Response(null, { status: 400, headers: CORS })
  }
  if (!parsed.success) return new Response(null, { status: 400, headers: CORS })
  const site = await prisma.site.findUnique({ where: { key: parsed.data.s }, include: { workspace: { include: { account: { select: { pausedAt: true } } } } } })
  if (!site || site.workspace.account?.pausedAt) return done()
  if (!hostAllowed(site.domains, req.headers.get('origin') ?? req.headers.get('referer'))) return done()
  await recordBatch(site, parsed.data, meta)
  return done()
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
