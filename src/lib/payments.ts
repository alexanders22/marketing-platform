import 'server-only'
import { Prisma, type BillingCycle, type Payment } from '@prisma/client'
import { extendPaidUntil, grantPlanCredits } from './billing'
import type { BillingAddress } from './billing-address'
import { getPlans, getPricing } from './credits'
import { gelPerUsd } from './fx'
import { siteUrl, terminalUrl } from './hosts'
import {
  cancelSubscription,
  findSubscription,
  getSubscription,
  hppCheckout,
  listPlans,
  monremCurrency,
  monremEnabled,
  MonremError,
  subscriptionActive,
  txStatus,
  type MonremPlan,
  type MonremTx,
} from './monrem'
import { yearlyTotal, type PlanId } from './plans'
import { prisma } from './prisma'

// Card payments: what is for sale (priced on the server, never from the
// browser), the hosted checkout, and fulfilment — exactly once per payment,
// whichever arrives first: Monrem's callback, the customer's return, or the
// ticker's status check.
//
// Auto-renewal: a plan payment can carry the plan's Monrem recurring billing
// reference (mapped in Admin → Payments); Monrem then charges every cycle on
// its own. Each approved charge (callback, or found when the ticker reads the
// subscription) becomes a Payment of its own and extends paidUntil once.

export type Purchase = { kind: 'PACK'; credits: number } | { kind: 'PLAN'; plan: PlanId; cycle: BillingCycle; autoRenew?: boolean }

// The price in USD (VAT included) and what it buys.
async function quote(p: Purchase) {
  if (p.kind === 'PACK') {
    const pack = (await getPricing()).packs.find((x) => x.credits === p.credits)
    if (!pack) return null
    return { usd: pack.priceUsd, label: `${pack.credits.toLocaleString('en-US')} Loudpilot credits` }
  }
  const plan = (await getPlans()).find((x) => x.id === p.plan)
  if (!plan) return null
  const usd = p.cycle === 'YEARLY' ? yearlyTotal(plan.monthly) : plan.monthly
  return { usd, label: `Loudpilot ${plan.name} plan, ${p.cycle === 'YEARLY' ? '1 year' : '1 month'}` }
}

async function inCurrency(usd: number) {
  const currency = monremCurrency()
  const major = currency === 'GEL' ? usd * (await gelPerUsd()) : usd
  return { currency, amount: Math.round(major * 100) }
}

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'

const splitName = (name: string, email: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ?? email.split('@')[0]
  return { firstName: first.slice(0, 50), lastName: (parts.slice(1).join(' ') || first).slice(0, 50) }
}

/* ─── Recurring billing plans ───────────────────────────────────────────── */

// Which Monrem recurring plan renews which of ours: { "TEAM_MONTHLY": ref_id, … }.
export const RECURRING_KEY = 'monremPlans'
export type RecurringRefs = Partial<Record<`${PlanId}_${BillingCycle}`, string>>

export async function recurringRefs(): Promise<RecurringRefs> {
  const row = await prisma.setting.findUnique({ where: { key: RECURRING_KEY } })
  return (row?.value ?? {}) as RecurringRefs
}

const g = globalThis as { __khmaMonremPlans?: { at: number; list: MonremPlan[] } }
// The terminal's recurring plans, read at most every 10 minutes.
export async function monremPlans(fresh = false) {
  const c = g.__khmaMonremPlans
  if (!fresh && c && Date.now() - c.at < 10 * 60_000) return c.list
  const list = await listPlans()
  g.__khmaMonremPlans = { at: Date.now(), list }
  return list
}

export const planAmount = (p: MonremPlan) => ({ amount: Math.round(parseFloat(p.amount) * 100), currency: (p.currency?.code ?? '').toUpperCase() })

// Auto-renewal for a plan and cycle, when its Monrem plan exists, is active and
// costs what we sell it for (USD exactly; GEL within 5% — the rate moves).
export async function recurringOption(plan: PlanId, cycle: BillingCycle) {
  if (!monremEnabled()) return null
  const ref = (await recurringRefs())[`${plan}_${cycle}`]
  if (!ref) return null
  const mp = (await monremPlans().catch(() => [] as MonremPlan[])).find((x) => x.ref_id === ref && x.is_active)
  const q = await quote({ kind: 'PLAN', plan, cycle })
  if (!mp || !q) return null
  const want = await inCurrency(q.usd)
  const got = planAmount(mp)
  if (got.currency !== want.currency) return null
  if (want.currency === 'USD' ? got.amount !== want.amount : Math.abs(got.amount - want.amount) > want.amount * 0.05) return null
  return { refId: ref, amount: got.amount, currency: got.currency }
}

/* ─── Checkout ──────────────────────────────────────────────────────────── */

// Creates the payment and Monrem's checkout; the browser goes to the URL.
export async function startCheckout(o: {
  accountId: string
  user: { id: string; name: string; email: string }
  billing: BillingAddress
  ip: string
  purchase: Purchase
}): Promise<{ url?: string; error?: string }> {
  const q = await quote(o.purchase)
  if (!q || q.usd <= 0) return { error: 'This is not for sale' }
  const p = o.purchase
  const recurring = p.kind === 'PLAN' && p.autoRenew ? await recurringOption(p.plan, p.cycle) : null
  if (p.kind === 'PLAN' && p.autoRenew && !recurring) return { error: 'Auto-renewal is not available for this plan right now — pay once instead.' }
  const { currency, amount } = recurring ?? (await inCurrency(q.usd))
  const payment = await prisma.payment.create({
    data: {
      accountId: o.accountId,
      kind: p.kind,
      credits: p.kind === 'PACK' ? p.credits : null,
      plan: p.kind === 'PLAN' ? p.plan : null,
      cycle: p.kind === 'PLAN' ? p.cycle : null,
      periods: p.kind === 'PLAN' ? 1 : null,
      amount,
      currency,
      recurringRef: recurring?.refId ?? null,
      createdById: o.user.id,
    },
  })
  try {
    const tx = await hppCheckout({
      orderId: payment.id,
      amount,
      currency,
      recurringRef: recurring?.refId,
      description: recurring ? `${q.label}, renews automatically` : q.label,
      ip: o.ip,
      refererUrl: terminalUrl(),
      returnUrl: `${terminalUrl()}/app/credits?payment=${payment.id}`,
      callbackUrl: `${siteUrl()}/api/payments/monrem`,
      customer: { ...splitName(o.user.name, o.user.email), email: o.user.email },
      billing: o.billing,
    })
    await prisma.payment.update({ where: { id: payment.id }, data: { checkoutUrl: tx.hpp_url } })
    // The transaction id is only a lookup aid: a clash must not block the payment.
    if (tx.transaction_id)
      await prisma.payment.update({ where: { id: payment.id }, data: { transactionId: tx.transaction_id } }).catch((e) => {
        if (!isUnique(e)) throw e
        console.error('monrem transaction id already used', tx.transaction_id)
      })
    return { url: tx.hpp_url }
  } catch (e) {
    console.error('monrem checkout failed', payment.id, e instanceof Error ? e.message : e)
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'DECLINED', statusDescription: e instanceof MonremError ? e.message.slice(0, 300) : 'Checkout failed' } })
    return { error: 'The payment page could not be opened — please try again in a minute.' }
  }
}

/* ─── Callbacks, status checks, renewals ───────────────────────────────── */

// Our payment for a Monrem transaction: by order_id, by transaction id, or —
// a renewal Monrem charged on its own — a new one on the subscription.
async function paymentFor(tx: MonremTx, subscriptionId?: string): Promise<Payment | null> {
  const own = await prisma.payment.findUnique({ where: { id: tx.order_id } })
  if (own) return own
  if (!tx.transaction_id) return null
  const known = await prisma.payment.findUnique({ where: { transactionId: tx.transaction_id } })
  if (known) return known
  const sid = subscriptionId ?? (tx.subscription?.id != null ? String(tx.subscription.id) : null)
  const sub = sid ? await prisma.subscription.findUnique({ where: { id: sid } }) : null
  if (!sub) return null
  try {
    return await prisma.payment.create({
      data: {
        accountId: sub.accountId,
        kind: 'PLAN',
        plan: sub.plan,
        cycle: sub.cycle,
        periods: 1,
        amount: Number(tx.amount),
        currency: String(tx.currency).toUpperCase(),
        subscriptionId: sub.id,
        transactionId: tx.transaction_id,
      },
    })
  } catch (e) {
    if (isUnique(e)) return prisma.payment.findUnique({ where: { transactionId: tx.transaction_id } })
    throw e
  }
}

// Monrem's view of a payment (callback, status check or a subscription's
// charges) applied to ours. An approved payment never goes back; a first
// payment must be for what we asked.
export async function applyStatus(tx: MonremTx, subscriptionId?: string): Promise<Payment | null> {
  const payment = await paymentFor(tx, subscriptionId)
  if (!payment) return null
  const status = String(tx.status).toUpperCase()
  if (payment.status === 'APPROVED' || !['APPROVED', 'DECLINED', 'PENDING'].includes(status)) return payment
  if (status === 'APPROVED' && (Number(tx.amount) !== payment.amount || String(tx.currency).toUpperCase() !== payment.currency)) {
    console.error('monrem amount mismatch', payment.id, tx.amount, tx.currency)
    return prisma.payment.update({ where: { id: payment.id }, data: { statusDescription: `Amount mismatch: ${tx.amount} ${tx.currency}` } })
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: status as Payment['status'], statusDescription: tx.status_description?.slice(0, 300) ?? null },
  })
  if (tx.transaction_id && tx.transaction_id !== payment.transactionId) {
    await prisma.payment.update({ where: { id: payment.id }, data: { transactionId: tx.transaction_id } }).catch((e) => {
      if (!isUnique(e)) throw e
    })
  }
  if (status === 'APPROVED') {
    await fulfil(payment.id)
    if (payment.recurringRef && !payment.subscriptionId) await linkSubscription(payment.id, tx.subscription?.id != null ? String(tx.subscription.id) : null)
  }
  return prisma.payment.findUnique({ where: { id: payment.id } })
}

// Credits or plan time, once: the fulfilledAt claim and the booking share a transaction.
async function fulfil(id: string) {
  const done = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({ where: { id, status: 'APPROVED', fulfilledAt: null }, data: { fulfilledAt: new Date() } })
    if (claimed.count === 0) return null
    const p = await tx.payment.findUniqueOrThrow({ where: { id } })
    if (p.kind === 'PACK' && p.credits) {
      await tx.creditEntry.create({
        data: {
          accountId: p.accountId,
          amount: p.credits,
          reason: 'PURCHASE',
          idempotencyKey: `payment:${p.id}`,
          refType: 'payment',
          refId: p.id,
          note: `${p.credits.toLocaleString('en-US')} credits · card payment`,
        },
      })
      await tx.account.update({ where: { id: p.accountId }, data: { creditBalance: { increment: p.credits } } })
    } else if (p.kind === 'PLAN' && p.plan && p.cycle) {
      const a = await tx.account.findUniqueOrThrow({ where: { id: p.accountId }, select: { paidUntil: true } })
      const now = new Date()
      await tx.account.update({
        where: { id: p.accountId },
        data: { plan: p.plan, billingCycle: p.cycle, paidUntil: extendPaidUntil(a.paidUntil, p.periods ?? 1, p.cycle, now), trialEndsAt: now },
      })
    }
    return p
  })
  // This month's plan credits (idempotent per period).
  if (done?.kind === 'PLAN') await grantPlanCredits(done.accountId)
}

// The subscription a first auto-renewal payment started: from its callback,
// or looked up at Monrem. Any other auto-renewal of the account stops — one
// plan renews at a time.
async function linkSubscription(paymentId: string, known: string | null) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!p?.recurringRef || p.subscriptionId || !p.plan || !p.cycle) return
  const id = known ?? (await findSubscription(p.id).catch(() => null))?.id
  if (id == null) return
  const sid = String(id)
  await prisma.subscription.upsert({
    where: { id: sid },
    create: { id: sid, accountId: p.accountId, plan: p.plan, cycle: p.cycle, refId: p.recurringRef, checkedAt: new Date() },
    update: {},
  })
  await prisma.payment.update({ where: { id: p.id }, data: { subscriptionId: sid } })
  const others = await prisma.subscription.findMany({ where: { accountId: p.accountId, status: 'ACTIVE', id: { not: sid } }, select: { id: true } })
  for (const o of others) await stopSubscription(o.id, 'replaced')
}

async function stopSubscription(id: string, why: string) {
  try {
    const s = await cancelSubscription(id)
    await prisma.subscription.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), providerStatus: s?.status ?? why } })
    return true
  } catch (e) {
    console.error('monrem cancel failed', id, why, e instanceof Error ? e.message : e)
    return false
  }
}

// The customer turns auto-renewal off (or changes plan): the paid period stays.
export async function cancelAutoRenew(accountId: string): Promise<{ error?: string }> {
  const active = await prisma.subscription.findMany({ where: { accountId, status: 'ACTIVE' }, select: { id: true } })
  for (const s of active) if (!(await stopSubscription(s.id, 'cancelled'))) return { error: 'Monrem did not answer — please try again in a minute.' }
  return {}
}

// A callback is only a hint: what it says is confirmed with Monrem's API
// before anything is booked, so a leaked API password can't fake a payment.
// A renewal (an order id we don't know) must also be one of the
// subscription's own charges. Throws when Monrem can't be asked — the route
// answers 503 and Monrem (or the ticker) tries again.
export async function applyCallback(tx: MonremTx) {
  const confirmed = await txStatus(tx.order_id)
  if (confirmed.order_id !== tx.order_id) return null
  const sid = confirmed.subscription?.id ?? tx.subscription?.id
  const known =
    (await prisma.payment.findUnique({ where: { id: tx.order_id }, select: { id: true } })) ??
    (confirmed.transaction_id ? await prisma.payment.findUnique({ where: { transactionId: confirmed.transaction_id }, select: { id: true } }) : null)
  if (!known) {
    if (sid == null) return null
    const sub = await getSubscription(String(sid))
    const charges = [sub.transaction, ...(sub.transactions ?? [])]
    if (!charges.some((c) => c?.order_id === tx.order_id)) return null
  }
  return applyStatus({ ...confirmed, amount: Number(confirmed.amount), transaction_id: confirmed.transaction_id ?? tx.transaction_id }, sid != null ? String(sid) : undefined)
}

// Ask Monrem when the callback is late (or never came).
export async function syncPayment(id: string) {
  try {
    return await applyStatus(await txStatus(id))
  } catch (e) {
    console.error('monrem status failed', id, e instanceof Error ? e.message : e)
    return prisma.payment.findUnique({ where: { id } })
  }
}

// Pending payments from the last two days, a few per tick.
export async function syncPendingPayments(now = new Date()) {
  if (!monremEnabled()) return 0
  const due = await prisma.payment.findMany({
    where: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - 60_000), gt: new Date(now.getTime() - 2 * 86_400_000) } },
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: { id: true },
  })
  for (const p of due) await syncPayment(p.id)
  return due.length
}

// Hourly: link first payments to their subscriptions, then read each active
// subscription — its status, and every charge Monrem made (a renewal whose
// callback never came is booked here).
export async function syncSubscriptionsDue(now = new Date(), force = false) {
  if (!monremEnabled()) return 0
  const unlinked = await prisma.payment.findMany({
    where: { status: 'APPROVED', recurringRef: { not: null }, subscriptionId: null, createdAt: { gt: new Date(now.getTime() - 3 * 86_400_000) } },
    take: 10,
    select: { id: true },
  })
  for (const p of unlinked) await linkSubscription(p.id, null)
  const due = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', ...(force ? {} : { OR: [{ checkedAt: null }, { checkedAt: { lt: new Date(now.getTime() - 60 * 60_000) } }] }) },
    orderBy: { checkedAt: 'asc' },
    take: 20,
  })
  for (const s of due) {
    try {
      const m = await getSubscription(s.id)
      for (const t of [m.transaction, ...(m.transactions ?? [])]) if (t?.order_id && t.status) await applyStatus({ ...t, amount: Number(t.amount) }, s.id)
      await prisma.subscription.update({
        where: { id: s.id },
        data: { checkedAt: now, providerStatus: m.status, ...(subscriptionActive(m.status) ? {} : { status: 'ENDED', cancelledAt: now }) },
      })
    } catch (e) {
      console.error('monrem subscription sync failed', s.id, e instanceof Error ? e.message : e)
      await prisma.subscription.update({ where: { id: s.id }, data: { checkedAt: now } })
    }
  }
  return due.length
}
