import 'server-only'
import { prisma } from './prisma'

// An Agency customer's own API access: the account becomes a partner of its
// own. Its companies are addressed by their Loudpilot id (the externalId the
// API uses); companies created through the API belong to the account.
export async function ensureApiPartner(account: { id: string; name: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${'api-partner:' + account.id}))`
    const partner =
      (await tx.partner.findUnique({ where: { ownerAccountId: account.id } })) ??
      (await tx.partner.create({ data: { name: account.name, slug: `account-${account.id}`, mode: 'MULTI', ownerAccountId: account.id } }))
    await adoptCompanies(tx, account.id, partner.id)
    return partner
  })
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Companies made in the app join the account's API partner (once).
export async function adoptCompanies(tx: Tx, accountId: string, partnerId: string) {
  const loose = await tx.workspace.findMany({ where: { accountId, partnerId: null }, select: { id: true } })
  for (const w of loose) await tx.workspace.update({ where: { id: w.id }, data: { partnerId, externalId: w.id } })
}
