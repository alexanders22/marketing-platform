import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export const INVITE_TTL_MS = 7 * 86_400_000

type Db = Prisma.TransactionClient | typeof prisma

// Members plus invitations still waiting to be accepted. Every plan has
// unlimited users, so this is only shown, never enforced.
export async function seatsUsed(accountId: string, db: Db = prisma, now = new Date()) {
  const [members, pending] = await Promise.all([
    db.accountMember.count({ where: { accountId } }),
    db.invitation.count({ where: { accountId, acceptedAt: null, expiresAt: { gt: now } } }),
  ])
  return { members, pending, used: members + pending }
}
