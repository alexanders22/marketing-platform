import { z } from 'zod'
import { ApiError, body, handler, json, partnerWorkspace, requirePartner } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { serializeWorkspace } from '@/lib/workspaces'

const Signup = z.object({
  name: z.string().min(1).max(200),
  email: z.email(),
  country: z.string().length(2).optional(),
  currency: z.string().length(3).optional(),
  // The partner must show Loudpilot's terms and pass the customer's consent.
  acceptTerms: z.literal(true),
})

// Short registration a partner profile completes before it can buy and spend
// credits. Creates the paying Account and attaches the workspace to it.
export const POST = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]/signup'>) => {
  const partner = await requirePartner(req)
  const { externalId } = await ctx.params
  const ws = await partnerWorkspace(partner, externalId)
  if (ws.accountId) throw new ApiError(409, 'already_registered', 'Workspace is already registered')

  const input = await body(req, Signup)

  const updated = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        country: input.country?.toUpperCase(),
        currency: input.currency?.toUpperCase() ?? 'GEL',
        partnerId: partner.id,
        termsAcceptedAt: new Date(),
      },
    })
    // Conditional update guards against two concurrent signups for one workspace.
    const res = await tx.workspace.updateMany({
      where: { id: ws.id, accountId: null },
      data: { accountId: account.id },
    })
    if (res.count === 0) throw new ApiError(409, 'already_registered', 'Workspace is already registered')
    return tx.workspace.findUniqueOrThrow({ where: { id: ws.id }, include: { account: true } })
  })

  return json({ workspace: serializeWorkspace(updated) }, 201)
})
