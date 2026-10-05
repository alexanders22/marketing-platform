import 'server-only'
import type { Prisma } from '@prisma/client'
import { planLimits } from './plans'
import { prisma } from './prisma'

export const INVITE_TTL_MS = 7 * 86_400_000

type Db = Prisma.TransactionClient | typeof prisma

// Seats in use: members plus invitations still waiting to be accepted.
export async function seatsUsed(accountId: string, db: Db = prisma, now = new Date()) {
  const [members, pending] = await Promise.all([
    db.accountMember.count({ where: { accountId } }),
    db.invitation.count({ where: { accountId, acceptedAt: null, expiresAt: { gt: now } } }),
  ])
  return { members, pending, used: members + pending }
}

export const seatLimit = (plan: string) => planLimits(plan).users
