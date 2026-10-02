import 'server-only'
import type { CreditReason } from '@prisma/client'
import { prisma } from './prisma'

// Credit prices in one place.
export const COST = {
  postText: 1,
  image: 1,
  campaignPost: 1,
  blogArticle: 3,
  blogOutline: 1,
} as const

export type Charge = { amount: number; reason: CreditReason; note: string }

// Debits several line items atomically. Returns false (and charges nothing)
// if the balance cannot cover the total — the conditional update stops two
// concurrent generations from taking the balance below zero.
export async function charge(accountId: string, workspaceId: string, items: Charge[]) {
  const total = items.reduce((s, i) => s + i.amount, 0)
  if (total <= 0) return true
  return prisma.$transaction(async (tx) => {
    const res = await tx.account.updateMany({
      where: { id: accountId, creditBalance: { gte: total } },
      data: { creditBalance: { decrement: total } },
    })
    if (res.count === 0) return false
    for (const i of items.filter((x) => x.amount > 0)) {
      await tx.creditEntry.create({
        data: { accountId, workspaceId, amount: -i.amount, reason: i.reason, note: i.note },
      })
    }
    return true
  })
}

export const notEnough = (need: number, have: number) =>
  `This needs ${need} credit${need === 1 ? '' : 's'} and you have ${have}. Choose a plan to get more.`
