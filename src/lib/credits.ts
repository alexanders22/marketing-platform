import 'server-only'
import type { CreditReason, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { ACTION_KEYS, DEFAULT_PRICING, pricesOf, VEO_PLANS, type Action, type Prices, type Pricing } from './pricing'

// Credit prices: defaults in src/lib/pricing.ts, overridden by super admins
// (Setting "pricing"). Read through a short cache — every charge asks.
let cached: { at: number; value: Pricing } | null = null
const TTL_MS = 30_000

export async function getPricing(): Promise<Pricing> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value
  const row = await prisma.setting.findUnique({ where: { key: 'pricing' } })
  const saved = (row?.value ?? {}) as Partial<Pricing>
  const value: Pricing = {
    creditPriceUsd: typeof saved.creditPriceUsd === 'number' ? saved.creditPriceUsd : DEFAULT_PRICING.creditPriceUsd,
    veoSecondsPerMonth: Object.fromEntries(
      VEO_PLANS.map((p) => [p, Number.isFinite(saved.veoSecondsPerMonth?.[p]) ? saved.veoSecondsPerMonth![p] : DEFAULT_PRICING.veoSecondsPerMonth[p]]),
    ) as Pricing['veoSecondsPerMonth'],
    actions: Object.fromEntries(
      ACTION_KEYS.map((k) => {
        const a = saved.actions?.[k]
        const d = DEFAULT_PRICING.actions[k]
        return [k, { credits: Number.isFinite(a?.credits) ? a!.credits : d.credits, costUsd: Number.isFinite(a?.costUsd) ? a!.costUsd : d.costUsd }]
      }),
    ) as Pricing['actions'],
  }
  cached = { at: Date.now(), value }
  return value
}

export const forgetPricing = () => {
  cached = null
}

// Credits per unit for each action.
export async function prices(): Promise<Prices> {
  return pricesOf(await getPricing())
}

export type Charge = { amount: number; reason: CreditReason; note: string; action?: Action; units?: number }

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
          data: { accountId, workspaceId, amount: -i.amount, reason: i.reason, note: i.note, action: i.action ?? null, units: i.units ?? null },
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

const CLIP_ACTIONS = ['clipQuick', 'clipPro', 'clipCinema']

// Seconds of AI clips an account used this calendar month (UTC): charges
// count, refunds (negative units) give them back.
export async function veoSecondsUsed(accountId: string, now = new Date()) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const r = await prisma.creditEntry.aggregate({ where: { accountId, action: { in: CLIP_ACTIONS }, createdAt: { gte: from } }, _sum: { units: true } })
  return Math.max(0, Math.round(r._sum.units ?? 0))
}

// This month's Veo allowance: used and limit (0 without a paid plan).
export async function veoAllowance(account: { id: string; plan: string }) {
  const [pricing, used] = await Promise.all([getPricing(), veoSecondsUsed(account.id)])
  const limit = (VEO_PLANS as readonly string[]).includes(account.plan) ? pricing.veoSecondsPerMonth[account.plan as (typeof VEO_PLANS)[number]] : 0
  return { used, limit, left: Math.max(0, limit - used) }
}

export const veoLimitMessage = (a: { used: number; limit: number }, need: number) =>
  `This needs ${need}s of AI clips and your plan has ${Math.max(0, a.limit - a.used)}s left this month (${a.used} of ${a.limit}s used). It renews on the 1st — or upgrade for more.`
