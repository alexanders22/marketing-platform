import { ApiError, handler, json, partnerWorkspace, requirePartner } from '@/lib/api'
import { goalJson } from '@/lib/api-serialize'
import { createGoalFor } from '@/lib/goal-input'
import { prisma } from '@/lib/prisma'

export const GET = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]/goals'>) => {
  const partner = await requirePartner(req)
  const ws = await partnerWorkspace(partner, (await ctx.params).externalId)
  const goals = await prisma.goal.findMany({ where: { workspaceId: ws.id }, orderBy: { createdAt: 'desc' } })
  return json({ goals: goals.map(goalJson) })
})

export const POST = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]/goals'>) => {
  const partner = await requirePartner(req)
  const ws = await partnerWorkspace(partner, (await ctx.params).externalId)
  let raw: Record<string, unknown>
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'invalid_json', 'Body must be JSON')
  }
  // API uses lower-case enums and campaignId.
  const res = await createGoalFor(ws.id, {
    ...raw,
    scope: typeof raw.scope === 'string' ? raw.scope.toUpperCase() : raw.scope,
    network: typeof raw.network === 'string' ? raw.network.toUpperCase() : raw.network,
    adCampaignId: raw.campaignId,
  })
  if (res.error) throw new ApiError(400, 'invalid_goal', res.error)
  return json({ goal: goalJson(res.goal!) }, 201)
})
