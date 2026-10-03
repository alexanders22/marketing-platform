import { z } from 'zod'
import { body, handler, json, partnerWorkspace, requirePartner } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const Input = z.object({ ids: z.array(z.string()).max(500).optional() })

// Mark alerts read (all unread if no ids).
export const POST = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]/alerts/read'>) => {
  const partner = await requirePartner(req)
  const ws = await partnerWorkspace(partner, (await ctx.params).externalId)
  const { ids } = await body(req, Input)
  const { count } = await prisma.alert.updateMany({
    where: { workspaceId: ws.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  })
  return json({ marked: count })
})
