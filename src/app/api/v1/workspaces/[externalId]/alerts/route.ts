import { handler, json, partnerWorkspace, requirePartner } from '@/lib/api'
import { alertJson } from '@/lib/api-serialize'
import { prisma } from '@/lib/prisma'

// Latest alerts, newest first. ?unread=true for unread only.
export const GET = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]/alerts'>) => {
  const partner = await requirePartner(req)
  const ws = await partnerWorkspace(partner, (await ctx.params).externalId)
  const unread = new URL(req.url).searchParams.get('unread') === 'true'
  const alerts = await prisma.alert.findMany({
    where: { workspaceId: ws.id, ...(unread ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return json({ alerts: alerts.map(alertJson) })
})
