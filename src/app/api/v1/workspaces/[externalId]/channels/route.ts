import { handler, json, partnerWorkspace, requirePartner } from '@/lib/api'
import { channelJson } from '@/lib/api-serialize'
import { prisma } from '@/lib/prisma'

// Connected pages, Instagram accounts and ad accounts of the workspace.
export const GET = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]/channels'>) => {
  const partner = await requirePartner(req)
  const ws = await partnerWorkspace(partner, (await ctx.params).externalId)
  const list = await prisma.socialAccount.findMany({ where: { workspaceId: ws.id }, orderBy: [{ network: 'asc' }, { name: 'asc' }] })
  return json({ channels: list.map(channelJson) })
})
