import { overLimit } from '@/lib/rate-limit'

// Errors reported by the browser (src/lib/client-errors.ts), written to the
// server log so a "page couldn't load" has a cause to look at.
export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
  if (overLimit(`client-error:${ip}`, 30, 10 * 60_000)) return new Response(null, { status: 204 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
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
