import { chatAvailable } from '@/lib/chatbot'
import { prisma } from '@/lib/prisma'
import { CORS, corsJson, fromLoudpilot, isPreview } from '@/lib/tag'

// What /t.js needs to know about its site: consent mode, automatic forms,
// pixel mirroring and the chat widget (or null). Cached for a minute.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const key = q.get('s') ?? ''
  const site = key ? await prisma.site.findUnique({ where: { key }, include: { workspace: { include: { chatBot: true, account: true } } } }) : null
  if (!site) return corsJson({ error: { code: 'unknown_site', message: 'Unknown site key' } }, 404)
  const bot = site.workspace.chatBot
  // The owner's preview shows the chat only on Loudpilot's demo shop.
  const preview = isPreview(q.get('p'), site.id) && !site.workspace.account?.pausedAt && fromLoudpilot(req.headers.get('origin') ?? req.headers.get('referer'))
  return corsJson(
    {
      consent: site.consentRequired,
      forms: site.autoForms,
      mirror: site.pixelMirror,
      chat:
        bot && (chatAvailable(bot, site.workspace.account) || preview)
          ? { name: bot.name, greeting: bot.greeting, color: bot.color, position: bot.position }
          : null,
    },
    200,
    { 'cache-control': preview ? 'no-store' : 'public, max-age=60' },
  )
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
