import { after } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { cronSecret } from '@/lib/cron-secret'
import { dispatchAlerts } from '@/lib/alerts'
import { refreshDossiersDue } from '@/lib/dossier'
import { checkAllGoals } from '@/lib/goals'
import { syncInboxDue } from '@/lib/inbox'
import { advanceClipsDue } from '@/lib/veo'
import { syncAdsDue } from '@/lib/meta-ads'
import { reviewsDue } from '@/lib/weekly'
import { publishDue, refreshInsights } from '@/lib/publisher'

// Background work, called every minute by src/instrumentation.ts (or any
// external cron with the header). Post insights run every 30 minutes; each
// ad account is re-read hourly; goals are checked hourly; alerts go out on
// every tick.
let lastInsights = 0
let lastGoals = 0
let lastDossiers = 0

export async function POST(req: Request) {
  const given = Buffer.from(req.headers.get('x-khma-cron') ?? '')
  const expected = Buffer.from(cronSecret())
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response('Forbidden', { status: 403 })

  const q = new URL(req.url).searchParams
  const force = q.get('insights') === '1'
  const published = await publishDue()
  let insights = 0
  if (force || Date.now() - lastInsights > 30 * 60 * 1000) {
    lastInsights = Date.now()
    insights = await refreshInsights()
  }
  const ads = await syncAdsDue()
  // Direct messages: each account every 2 minutes.
  const inbox = await syncInboxDue()
  // AI clips: finish the ones Veo is done with (also when nobody is watching).
  const clips = await advanceClipsDue()
  // Goals hourly, after fresh ad and post numbers.
  let goals = 0
  if (q.get('goals') === '1' || Date.now() - lastGoals > 60 * 60 * 1000) {
    lastGoals = Date.now()
    goals = await checkAllGoals()
  }
  // Post history and audit, and Monday reviews: a few per hour. Slow (AI),
  // so it runs after the response and never holds up publishing.
  let dossiers = false
  if (Date.now() - lastDossiers > 60 * 60 * 1000) {
    lastDossiers = Date.now()
    dossiers = true
    after(async () => {
      await refreshDossiersDue().catch((e) => console.error('dossiers failed', e))
      // Monday reviews, after the dossiers are fresh.
      await reviewsDue().catch((e) => console.error('reviews failed', e))
    })
  }
  const alerts = await dispatchAlerts()
  return Response.json({ published, insights, ads, inbox, clips, goals, dossiers, alerts })
}
