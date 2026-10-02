import { z } from 'zod'
import { ApiError, body, handler, json, requirePartner } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { serializeWorkspace } from '@/lib/workspaces'

const UpsertWorkspace = z.object({
  externalId: z.string().min(1).max(191),
  name: z.string().min(1).max(200),
  locale: z.string().min(2).max(10).optional(),
})

// Idempotent: the partner calls this whenever a profile opens Marketing.
// Creates the workspace on first call, updates name/locale afterwards.
export const POST = handler(async (req) => {
  const partner = await requirePartner(req)
  const input = await body(req, UpsertWorkspace)

  // One transaction with a per-partner advisory lock, so concurrent calls
  // can't both pass the SINGLE-mode check.
  const ws = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${'partner-ws:' + partner.id}))`
    if (partner.mode === 'SINGLE') {
      const other = await tx.workspace.findFirst({
        where: { partnerId: partner.id, NOT: { externalId: input.externalId } },
        select: { id: true },
      })
      if (other) throw new ApiError(409, 'single_workspace', 'This partner can have only one workspace')
    }
    return tx.workspace.upsert({
      where: { partnerId_externalId: { partnerId: partner.id, externalId: input.externalId } },
      create: { partnerId: partner.id, externalId: input.externalId, name: input.name, locale: input.locale },
      update: { name: input.name, ...(input.locale && { locale: input.locale }) },
      include: { account: true },
    })
  })
  return json({ workspace: serializeWorkspace(ws) })
})

export const GET = handler(async (req) => {
  const partner = await requirePartner(req)
  const list = await prisma.workspace.findMany({
    where: { partnerId: partner.id },
    include: { account: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return json({ workspaces: list.map(serializeWorkspace) })
})
