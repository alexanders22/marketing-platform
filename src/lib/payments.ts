import 'server-only'
import type { BillingCycle, Payment } from '@prisma/client'
import { extendPaidUntil, grantPlanCredits } from './billing'
import { getPlans, getPricing } from './credits'
import { gelPerUsd } from './fx'
import { siteUrl, terminalUrl } from './hosts'
import { hppCheckout, monremCurrency, monremEnabled, MonremError, txStatus, type MonremTx } from './monrem'
import { yearlyTotal, type PlanId } from './plans'
import { prisma } from './prisma'

// Card payments: what is for sale (priced on the server, never from the
// browser), the hosted checkout, and fulfilment — exactly once per payment,
// whichever arrives first: Monrem's callback, the customer's return, or the
// ticker's status check.

export type Purchase = { kind: 'PACK'; credits: number } | { kind: 'PLAN'; plan: PlanId; cycle: BillingCycle }

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

const splitName = (name: string, email: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ?? email.split('@')[0]
  return { firstName: first.slice(0, 50), lastName: (parts.slice(1).join(' ') || first).slice(0, 50) }
}

// Creates the payment and Monrem's checkout; the browser goes to the URL.
export async function startCheckout(o: {
  accountId: string
  user: { id: string; name: string; email: string }
  country: string | null
  ip: string
  purchase: Purchase
}): Promise<{ url?: string; error?: string }> {
  const q = await quote(o.purchase)
  if (!q || q.usd <= 0) return { error: 'This is not for sale' }
  const { currency, amount } = await inCurrency(q.usd)
  const p = o.purchase
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
      createdById: o.user.id,
    },
  })
  try {
    const tx = await hppCheckout({
      orderId: payment.id,
      amount,
      currency,
      description: q.label,
      ip: o.ip,
      refererUrl: terminalUrl(),
      returnUrl: `${terminalUrl()}/app/credits?payment=${payment.id}`,
      callbackUrl: `${siteUrl()}/api/payments/monrem`,
      customer: { ...splitName(o.user.name, o.user.email), email: o.user.email, country: o.country && /^[A-Z]{2}$/.test(o.country) ? o.country : null },
    })
    await prisma.payment.update({ where: { id: payment.id }, data: { transactionId: tx.transaction_id ?? null, checkoutUrl: tx.hpp_url } })
    return { url: tx.hpp_url }
  } catch (e) {
    console.error('monrem checkout failed', payment.id, e instanceof Error ? e.message : e)
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'DECLINED', statusDescription: e instanceof MonremError ? e.message.slice(0, 300) : 'Checkout failed' } })
    return { error: 'The payment page could not be opened — please try again in a minute.' }
  }
}

// Monrem's view of a payment (callback or status check) applied to ours.
// An approved payment never goes back; the amount must match what we asked.
export async function applyStatus(tx: MonremTx): Promise<Payment | null> {
  const payment = await prisma.payment.findUnique({ where: { id: tx.order_id } })
  if (!payment) return null
  const status = String(tx.status).toUpperCase()
  if (payment.status === 'APPROVED' || !['APPROVED', 'DECLINED', 'PENDING'].includes(status)) return payment
  if (status === 'APPROVED' && (Number(tx.amount) !== payment.amount || String(tx.currency).toUpperCase() !== payment.currency)) {
    console.error('monrem amount mismatch', payment.id, tx.amount, tx.currency)
    return prisma.payment.update({ where: { id: payment.id }, data: { statusDescription: `Amount mismatch: ${tx.amount} ${tx.currency}` } })
  }
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: status as Payment['status'],
      statusDescription: tx.status_description?.slice(0, 300) ?? null,
      transactionId: tx.transaction_id ?? payment.transactionId,
    },
  })
  if (status === 'APPROVED') await fulfil(payment.id)
  return prisma.payment.findUnique({ where: { id: payment.id } }).then((p) => p ?? updated)
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
