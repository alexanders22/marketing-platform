import { ApiError, handler, json, partnerWorkspace, requirePartner } from '@/lib/api'
import { recommendationJson } from '@/lib/api-serialize'
import { prisma } from '@/lib/prisma'
import type { ReviewData } from '@/lib/weekly'

// The latest weekly review with its recommendations.
export const GET = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]/reviews/latest'>) => {
  const partner = await requirePartner(req)
  const ws = await partnerWorkspace(partner, (await ctx.params).externalId)
  const r = await prisma.weeklyReview.findFirst({
    where: { workspaceId: ws.id },
    orderBy: { createdAt: 'desc' },
    include: { recommendations: { orderBy: { createdAt: 'asc' } } },
  })
  if (!r) throw new ApiError(404, 'review_not_found', 'No weekly review yet')
  const d = r.data as ReviewData
  return json({
    review: {
      id: r.id,
      weekStart: r.weekStart,
      weekEnd: r.weekEnd,
      headline: d.headline,
      summary: d.summary,
      wins: d.wins,
      issues: d.issues,
      createdAt: r.createdAt,
      recommendations: r.recommendations.map(recommendationJson),
    },
  })
})
