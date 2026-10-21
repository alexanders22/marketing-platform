import 'server-only'
import type { BillingCycle } from '@prisma/client'
import { getPlans } from './credits'
import { billingState } from './plans'
import { prisma } from './prisma'

// Paid periods. No card payments yet: a super admin books a payment, which
// moves paidUntil forward; while it is in the future the plan's credits are
// granted once per monthly period (the ticker grants each new month).

const addMonths = (d: Date, n: number) => {
  const x = new Date(d)
  x.setUTCMonth(x.getUTCMonth() + n)
  return x
}

// Monthly periods are counted back from paidUntil, so they stay aligned
// however many payments extend it.
export function periodStart(paidUntil: Date, now = new Date()) {
  let d = paidUntil
  for (let i = 0; i < 240 && d > now; i++) d = addMonths(d, -1)
  return d
}

// The plan's credits for the current period, once (idempotency key per
// period). Returns the credits granted, 0 if already granted or not paid.
export async function grantPlanCredits(accountId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.account.findUnique({ where: { id: accountId }, select: { plan: true, trialEndsAt: true, paidUntil: true } })
    if (!a || billingState(a, now) !== 'active') return 0
    const plan = (await getPlans()).find((p) => p.id === a.plan)
    const credits = plan?.credits ?? 0
    if (credits <= 0) return 0
    const start = periodStart(a.paidUntil!, now)
    const idempotencyKey = `plan:${accountId}:${start.toISOString().slice(0, 10)}`
    if (await tx.creditEntry.findUnique({ where: { idempotencyKey }, select: { id: true } })) return 0
    await tx.creditEntry.create({
      data: { accountId, amount: credits, reason: 'GRANT', idempotencyKey, note: `${plan?.name ?? a.plan} plan credits` },
    })
    await tx.account.update({ where: { id: accountId }, data: { creditBalance: { increment: credits } } })
    return credits
  })
}

export async function grantPlanCreditsDue(now = new Date()) {
  const due = await prisma.account.findMany({
    where: { paidUntil: { gt: now }, pausedAt: null, plan: { not: 'NONE' } },
    select: { id: true },
  })
  let granted = 0
  for (const a of due) granted += (await grantPlanCredits(a.id, now)) > 0 ? 1 : 0
  return granted
}

// The new paid-through date: `periods` cycles from today, or from the
// current paid date while it is still running.
export function extendPaidUntil(current: Date | null, periods: number, cycle: BillingCycle, now = new Date()) {
  const from = current && current > now ? current : now
  return addMonths(from, periods * (cycle === 'YEARLY' ? 12 : 1))
}

// A payment for `periods` billing cycles: paidUntil moves forward from today
// (or from the current paid date, if still running), the trial ends, and
// this month's credits arrive.
export async function bookPayment(accountId: string, periods: number, cycle: BillingCycle, now = new Date()) {
  const a = await prisma.account.findUniqueOrThrow({ where: { id: accountId }, select: { paidUntil: true } })
  const paidUntil = extendPaidUntil(a.paidUntil, periods, cycle, now)
  await prisma.account.update({ where: { id: accountId }, data: { paidUntil, billingCycle: cycle, trialEndsAt: now } })
  const granted = await grantPlanCredits(accountId, now)
  return { paidUntil, granted }
}
