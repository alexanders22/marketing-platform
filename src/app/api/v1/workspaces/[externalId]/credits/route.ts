import { ApiError, handler, json, partnerWorkspace, requirePartner } from '@/lib/api'
import { prisma } from '@/lib/prisma'

// Balance + recent history, so the partner can show it inside its own UI.
export const GET = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]/credits'>) => {
  const partner = await requirePartner(req)
  const { externalId } = await ctx.params
  const ws = await partnerWorkspace(partner, externalId)
  if (!ws.accountId) throw new ApiError(409, 'not_registered', 'Workspace has not completed signup')

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: ws.accountId },
    include: { credits: { orderBy: { createdAt: 'desc' }, take: 50 } },
  })
  return json({
    balance: account.creditBalance,
    currency: account.currency,
    entries: account.credits.map((c) => ({
      amount: c.amount,
      reason: c.reason,
      note: c.note,
      createdAt: c.createdAt,
    })),
  })
})
