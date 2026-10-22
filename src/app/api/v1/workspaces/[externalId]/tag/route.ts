import { handler, json, partnerWorkspace, requirePartner } from '@/lib/api'
import { siteUrl } from '@/lib/hosts'
import { prisma } from '@/lib/prisma'
import { ensureSite } from '@/lib/tag'

// The workspace's Loudpilot Tag: the snippet to put on the customer's website
// (website builders can add it for them) and whether it is live.
export const GET = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]/tag'>) => {
  const partner = await requirePartner(req)
  const ws = await partnerWorkspace(partner, (await ctx.params).externalId)
  const site = await ensureSite(ws.id)
  const bot = await prisma.chatBot.findUnique({ where: { workspaceId: ws.id }, select: { enabled: true } })
  return json({
    siteKey: site.key,
    scriptUrl: `${siteUrl()}/t.js`,
    snippet: `<script async src="${siteUrl()}/t.js" data-site="${site.key}"></script>`,
    installed: site.lastEventAt !== null,
    lastEventAt: site.lastEventAt?.toISOString() ?? null,
    chatEnabled: bot?.enabled ?? false,
  })
})
