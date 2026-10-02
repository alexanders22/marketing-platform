import { handler, json, partnerWorkspace, requirePartner } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { serializeWorkspace } from '@/lib/workspaces'

export const GET = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]'>) => {
  const partner = await requirePartner(req)
  const { externalId } = await ctx.params
  const ws = await partnerWorkspace(partner, externalId)
  const full = await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id }, include: { account: true } })
  return json({ workspace: serializeWorkspace(full) })
})
