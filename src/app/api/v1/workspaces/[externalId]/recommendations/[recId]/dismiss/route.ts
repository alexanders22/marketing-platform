import { ApiError, handler, json, partnerWorkspace, requirePartner } from '@/lib/api'
import { recommendationJson } from '@/lib/api-serialize'
import { prisma } from '@/lib/prisma'
import { dismissRecommendation } from '@/lib/weekly'

export const POST = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]/recommendations/[recId]/dismiss'>) => {
  const partner = await requirePartner(req)
  const { externalId, recId } = await ctx.params
  const ws = await partnerWorkspace(partner, externalId)
  const rec = await prisma.recommendation.findFirst({ where: { id: recId, workspaceId: ws.id } })
  if (!rec) throw new ApiError(404, 'recommendation_not_found', 'Recommendation not found')
  if (rec.status !== 'OPEN') throw new ApiError(409, 'already_handled', 'This recommendation was already handled')
  await dismissRecommendation(rec)
  const fresh = await prisma.recommendation.findUniqueOrThrow({ where: { id: rec.id } })
  return json({ recommendation: recommendationJson(fresh) })
})
