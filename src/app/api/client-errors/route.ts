import { clientIp } from '@/lib/client-ip'
import { overLimit } from '@/lib/rate-limit'
import { readBody, tooLarge } from '@/lib/read-body'

// Errors reported by the browser (src/lib/client-errors.ts), written to the
// server log so a "page couldn't load" has a cause to look at.
export async function POST(req: Request) {
  const ip = clientIp(req.headers) ?? 'local'
  if (overLimit(`client-error:${ip}`, 30, 10 * 60_000)) return new Response(null, { status: 204 })
  const raw = await readBody(req, 16 * 1024)
  if (raw === null) return tooLarge()
  let b: Record<string, unknown> | null = null
  try {
    b = JSON.parse(raw) as Record<string, unknown> | null
  } catch {
    // Not JSON: nothing to log.
  }
  if (!b) return new Response(null, { status: 204 })
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined)
  console.error(
    'client-error',
    JSON.stringify({
      where: s(b.where, 40),
      url: s(b.url, 300),
      name: s(b.name, 100),
      message: s(b.message, 500),
      digest: s(b.digest, 100),
      build: s(b.build, 60),
      reloaded: b.reloaded === true,
      ua: s(req.headers.get('user-agent'), 200),
      stack: s(b.stack, 1500),
    }),
  )
  return new Response(null, { status: 204 })
}
