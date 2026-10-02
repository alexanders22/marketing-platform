import { timingSafeEqual } from 'node:crypto'
import { cronSecret } from '@/lib/cron-secret'
import { publishDue, refreshInsights } from '@/lib/publisher'

// Background work, called every minute by src/instrumentation.ts (or any
// external cron with the header). Insights run every 30 minutes.
let lastInsights = 0

export async function POST(req: Request) {
  const given = Buffer.from(req.headers.get('x-khma-cron') ?? '')
  const expected = Buffer.from(cronSecret())
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response('Forbidden', { status: 403 })

  const force = new URL(req.url).searchParams.get('insights') === '1'
  const published = await publishDue()
  let insights = 0
  if (force || Date.now() - lastInsights > 30 * 60 * 1000) {
    lastInsights = Date.now()
    insights = await refreshInsights()
  }
  return Response.json({ published, insights })
}
