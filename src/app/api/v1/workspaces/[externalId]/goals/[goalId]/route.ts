import { ApiError, handler, json, partnerWorkspace, requirePartner } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export const DELETE = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]/goals/[goalId]'>) => {
  const partner = await requirePartner(req)
  const { externalId, goalId } = await ctx.params
  const ws = await partnerWorkspace(partner, externalId)
  const { count } = await prisma.goal.deleteMany({ where: { id: goalId, workspaceId: ws.id } })
  if (count === 0) throw new ApiError(404, 'goal_not_found', 'Goal not found')
  return json({ deleted: true })
})
