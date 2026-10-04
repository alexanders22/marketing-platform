import 'server-only'
import type { CreditReason, Prisma } from '@prisma/client'
import { prisma } from './prisma'

// Credit prices in one place.
export const COST = {
  postText: 1,
  image: 1,
  campaignPost: 1,
  blogArticle: 3,
  blogOutline: 1,
  summary: 1,
  strategy: 5,
  reply: 1,
  advice: 1,
} as const

export type Charge = { amount: number; reason: CreditReason; note: string }

// Debits several line items atomically. Returns false (and charges nothing)
// if the balance cannot cover the total — the conditional update stops two
// concurrent generations from taking the balance below zero.
// `inTx` runs in the same transaction first: return false from it to abort
// without charging (e.g. "this article was already written meanwhile").
export async function charge(
  accountId: string,
  workspaceId: string,
  items: Charge[],
  inTx?: (tx: Prisma.TransactionClient) => Promise<boolean>,
) {
  const total = items.reduce((s, i) => s + i.amount, 0)
  try {
    return await prisma.$transaction(async (tx) => {
      if (inTx && !(await inTx(tx))) throw new Abort()
      if (total <= 0) return true
      const res = await tx.account.updateMany({
        // A paused account spends nothing.
        where: { id: accountId, creditBalance: { gte: total }, pausedAt: null },
        data: { creditBalance: { decrement: total } },
      })
      if (res.count === 0) throw new Abort()
      for (const i of items.filter((x) => x.amount > 0)) {
        await tx.creditEntry.create({
          data: { accountId, workspaceId, amount: -i.amount, reason: i.reason, note: i.note },
        })
      }
      return true
    })
  } catch (e) {
    if (e instanceof Abort) return false
    throw e
  }
}

class Abort extends Error {}

export async function balanceOf(accountId: string) {
  const a = await prisma.account.findUnique({ where: { id: accountId }, select: { creditBalance: true } })
  return a?.creditBalance ?? 0
}

export const notEnough = (need: number, have: number) =>
  `This needs ${need} credit${need === 1 ? '' : 's'} and you have ${have}. Choose a plan to get more.`
