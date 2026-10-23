import 'server-only'
import type { BillingCycle, Prisma } from '@prisma/client'
import { getPlans } from './credits'
import { billingState, PLANS, PROFILE_NETWORKS, type PlanId } from './plans'
import { prisma } from './prisma'

// Paid periods. A payment (by card, or booked by a super admin) moves
// paidUntil forward; while it is in the future the plan's credits are
// granted once a month (the ticker grants each new month).

// Calendar months in UTC, clamped to the last day of the target month (Jan 31 + 1 = Feb 28).
export const addMonths = (d: Date, n: number) => {
  const x = new Date(d)
  const day = x.getUTCDate()
  x.setUTCDate(1)
  x.setUTCMonth(x.getUTCMonth() + n)
  x.setUTCDate(Math.min(day, new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate()))
  return x
}

type Db = Prisma.TransactionClient
// The account row, locked until the transaction ends: whatever reads and
// moves paidUntil or grants plan credits takes turns.
export const lockAccount = (tx: Db, id: string) => tx.$executeRaw`select 1 from "Account" where id = ${id} for update`

const dayOf = (d: Date) => d.toISOString().slice(0, 10)

// The plan's credits, once a month. A month runs from the day of the last
// full grant (key plan:<account>:<YYYY-MM-DD>); the next one starts a month
// later when it is paid in full (so the last day of a period that isn't
// renewed brings nothing), or — after a gap — on the day of the payment.
// An upgrade within the month tops up to the new plan's credits (key
// plan:<account>:<day>:<PLAN>); a downgrade adds nothing. Returns the
// credits granted.
export async function grantPlanCredits(accountId: string, now = new Date(), tx?: Db): Promise<number> {
  if (!tx) return prisma.$transaction((t) => grantPlanCredits(accountId, now, t))
  await lockAccount(tx, accountId)
  const a = await tx.account.findUnique({ where: { id: accountId }, select: { plan: true, trialEndsAt: true, paidUntil: true, pausedAt: true } })
  if (!a || a.pausedAt || billingState(a, now) !== 'active') return 0
  const plan = (await getPlans()).find((p) => p.id === a.plan)
  if (!plan || plan.credits <= 0) return 0
  const prefix = `plan:${accountId}:`
  const last = await tx.creditEntry.findFirst({ where: { accountId, idempotencyKey: { startsWith: prefix } }, orderBy: { idempotencyKey: 'desc' }, select: { idempotencyKey: true } })
  const anchor = last ? new Date(`${last.idempotencyKey!.slice(prefix.length, prefix.length + 10)}T00:00:00Z`) : null
  const grant = async (amount: number, idempotencyKey: string, note: string) => {
    if (await tx.creditEntry.findUnique({ where: { idempotencyKey }, select: { id: true } })) return 0
    await tx.creditEntry.create({ data: { accountId, amount, reason: 'GRANT', idempotencyKey, note } })
    await tx.account.update({ where: { id: accountId }, data: { creditBalance: { increment: amount } } })
    return amount
  }
  const next = anchor && addMonths(anchor, 1)
  if (!anchor || now >= next!) {
    const today = new Date(`${dayOf(now)}T00:00:00Z`)
    const start = next && now < addMonths(next, 1) ? next : today
    if (anchor && a.paidUntil! < addMonths(start, 1)) return 0
    return grant(plan.credits, `${prefix}${dayOf(start)}`, `${plan.name} plan credits`)
  }
  const got = await tx.creditEntry.aggregate({ where: { accountId, idempotencyKey: { startsWith: `${prefix}${dayOf(anchor)}` } }, _sum: { amount: true } })
  const extra = plan.credits - (got._sum.amount ?? 0)
  return extra > 0 ? grant(extra, `${prefix}${dayOf(anchor)}:${a.plan}`, `${plan.name} plan credits (upgrade)`) : 0
}

export async function grantPlanCreditsDue(now = new Date()) {
  const due = await prisma.account.findMany({
    where: { paidUntil: { gt: now }, pausedAt: null, plan: { not: 'NONE' } },
    select: { id: true },
  })
  let granted = 0
  for (const a of due) {
    // One account's failure (a race with a payment) never stops the others.
    try {
      granted += (await grantPlanCredits(a.id, now)) > 0 ? 1 : 0
    } catch (e) {
      console.error('plan credits failed', a.id, e instanceof Error ? e.message : e)
    }
  }
  return granted
}

// The new paid-through date: `periods` cycles from today, or from the
// current paid date while it is still running.
export function extendPaidUntil(current: Date | null, periods: number, cycle: BillingCycle, now = new Date()) {
  const from = current && current > now ? current : now
  return addMonths(from, periods * (cycle === 'YEARLY' ? 12 : 1))
}

// Switching plans mid-period: the unused time of the old plan keeps its
// money's worth, as time on the new plan at the new plan's price.
export function convertRemaining(paidUntil: Date | null, oldMonthly: number, newMonthly: number, now = new Date()) {
  if (!paidUntil || paidUntil <= now || !(oldMonthly > 0) || !(newMonthly > 0)) return paidUntil
  return new Date(now.getTime() + ((paidUntil.getTime() - now.getTime()) * oldMonthly) / newMonthly)
}

// A payment for `periods` billing cycles, in the caller's transaction:
// paidUntil moves forward from today (or from the current paid date, if
// still running), the trial ends, and this month's credits arrive.
export async function bookPayment(tx: Db, accountId: string, periods: number, cycle: BillingCycle, now = new Date()) {
  await lockAccount(tx, accountId)
  const a = await tx.account.findUniqueOrThrow({ where: { id: accountId }, select: { paidUntil: true } })
  const paidUntil = extendPaidUntil(a.paidUntil, periods, cycle, now)
  await tx.account.update({ where: { id: accountId }, data: { paidUntil, billingCycle: cycle, trialEndsAt: now } })
  const granted = await grantPlanCredits(accountId, now, tx)
  return { paidUntil, granted }
}

// Why the account doesn't fit in a plan, or null. Limits are checked only
// when companies and profiles are added, so a smaller plan waits until the
// extra ones are removed.
export async function outgrows(accountId: string, planId: PlanId) {
  const p = PLANS.find((x) => x.id === planId)!
  const companies = await prisma.workspace.count({ where: { accountId } })
  if (companies > p.companies) return `You have ${companies} companies; ${p.name} includes ${p.companies}. Remove ${companies - p.companies} to switch.`
  const counts = await prisma.socialAccount.groupBy({ by: ['workspaceId'], where: { workspace: { accountId }, network: { in: PROFILE_NETWORKS } }, _count: { _all: true } })
  const top = counts.reduce<(typeof counts)[number] | null>((m, c) => (!m || c._count._all > m._count._all ? c : m), null)
  if (!top || top._count._all <= p.profiles) return null
  const ws = await prisma.workspace.findUnique({ where: { id: top.workspaceId }, select: { name: true } })
  const n = top._count._all
  return `${ws?.name ?? 'A company'} has ${n} social profiles; ${p.name} includes ${p.profiles} per company. Disconnect ${n - p.profiles} to switch.`
}
