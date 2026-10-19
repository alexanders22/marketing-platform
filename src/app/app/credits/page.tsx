import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, Clock, Coins, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/EmptyState'
import { requireContext } from '@/lib/context'
import { creditMoney } from '@/lib/money'
import { creditValue, getPlans, getPricing } from '@/lib/credits'
import { VAT } from '@/lib/tax'
import { prisma } from '@/lib/prisma'
import { monremEnabled } from '@/lib/monrem'
import { syncPayment } from '@/lib/payments'
import { billingState, yearlyTotal } from '@/lib/plans'
import { BuyButton } from './BuyButton'

export const metadata: Metadata = { title: 'Plan & credits — Loudpilot' }

const REASON: Record<string, string> = {
  PURCHASE: 'Top-up',
  REFUND: 'Refund',
  GRANT: 'Bonus',
  AI_TEXT: 'AI text',
  AI_IMAGE: 'AI image',
  AI_VIDEO: 'AI video',
  AI_BLOG: 'AI blog',
  ADJUSTMENT: 'Adjustment',
}

export default async function CreditsPage({ searchParams }: PageProps<'/app/credits'>) {
  const { account: acct, role } = await requireContext()
  const q = await searchParams
  // Back from Monrem's payment page: ask Monrem if the callback hasn't arrived yet.
  let paid = typeof q.payment === 'string' ? await prisma.payment.findFirst({ where: { id: q.payment, accountId: acct.id } }) : null
  if (paid?.status === 'PENDING' && monremEnabled()) paid = await syncPayment(paid.id)
  // Re-read: a fulfilled payment changed the balance or the plan.
  const account = paid ? await prisma.account.findUniqueOrThrow({ where: { id: acct.id } }) : acct
  const canPay = monremEnabled() && (role === 'OWNER' || role === 'ADMIN')
  const cantPay = !monremEnabled() ? 'Card payments are being set up' : !canPay ? 'Only the account owner or an admin can pay' : undefined
  const entries = await prisma.creditEntry.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const [plans, pricing, value] = await Promise.all([getPlans(), getPricing(), creditValue()])
  const plan = plans.find((p) => p.id === account.plan)
  const worth = creditMoney(account.creditBalance, value)
  const gel = (usd: number) => `₾${Math.round(usd * value.gelPerUsd).toLocaleString('en-US')}`
  const trial = account.trialEndsAt && account.trialEndsAt > new Date()
  const active = billingState(account) === 'active'

  return (
    <div className="max-w-3xl">
      <PageHeader title="Plan & credits" sub="AI generation spends credits. Your plan refills them every month." />

      {paid && <PaymentResult p={paid} paidUntil={account.paidUntil} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-5">
          <p className="text-sm text-zinc-500">Plan</p>
          <p className="mt-1 text-2xl font-semibold">{plan ? plan.name : 'No plan yet'}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {plan && active
              ? `Paid until ${account.paidUntil!.toLocaleDateString('en-GB')}`
              : plan && trial
                ? `Free trial until ${account.trialEndsAt!.toLocaleDateString('en-GB')}`
                : plan
                  ? `${account.billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly'} billing`
                  : 'Pick a plan to start your free trial.'}
          </p>
          {plan && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Pay for the plan">
              <div>
                <BuyButton purchase={{ kind: 'PLAN', plan: plan.id, cycle: 'MONTHLY' }} disabled={cantPay} className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
                  {active ? 'Extend' : 'Pay'} 1 month · ${plan.monthly}
                </BuyButton>
              </div>
              <div>
                <BuyButton purchase={{ kind: 'PLAN', plan: plan.id, cycle: 'YEARLY' }} disabled={cantPay} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold hover:bg-zinc-50">
                  1 year · ${yearlyTotal(plan.monthly)}
                </BuyButton>
              </div>
            </div>
          )}
          <Link href="/app/plan" className={`inline-block text-sm font-medium ${plan ? 'mt-3 text-indigo-600 hover:underline' : 'mt-4 rounded-lg bg-zinc-900 px-4 py-2 font-semibold text-white hover:bg-zinc-800'}`}>
            {plan ? 'Change plan' : 'Choose a plan'}
          </Link>
        </div>
        <div className="rounded-xl border border-zinc-200 p-5">
          <p className="inline-flex items-center gap-2 text-sm text-zinc-500">
            <Coins size={15} /> Credits left
          </p>
          <p className="mt-1 text-2xl font-semibold">{account.creditBalance.toLocaleString()}</p>
          {account.creditBalance > 0 && (
            <p className="text-xs text-zinc-400" data-no-credit-hint>
              worth ≈ {worth.gel} · {worth.usd}
            </p>
          )}
          <p className="mt-1 text-sm text-zinc-500">
            {plan ? `${plan.credits.toLocaleString()} credits per month on ${plan.name}` : 'Trial credits arrive with your plan.'}
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-zinc-200 p-5" aria-labelledby="buy-heading">
        <h2 id="buy-heading" className="font-semibold">
          Buy more credits
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500">On top of your plan, they never expire. Prices include {Math.round(VAT.rate * 100)}% VAT.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Credit packs">
          {pricing.packs.map((pk) => {
            const save = 1 - pk.priceUsd / (pk.credits * pricing.creditPriceUsd)
            return (
              <li key={pk.credits} className="relative flex flex-col rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                {save >= 0.05 && <span className="absolute -top-2.5 right-3 rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">Save {Math.round(save * 100)}%</span>}
                <p className="text-lg font-semibold">{pk.credits.toLocaleString()} credits</p>
                <p className="mt-1 text-2xl font-semibold" data-no-credit-hint>
                  {gel(pk.priceUsd)} <span className="text-sm font-normal text-zinc-500">· ${pk.priceUsd.toLocaleString('en-US')}</span>
                </p>
                <p className="text-xs text-zinc-500" data-no-credit-hint>
                  {gel(pk.priceUsd / pk.credits * 100)} per 100 credits
                </p>
                <BuyButton purchase={{ kind: 'PACK', credits: pk.credits }} disabled={cantPay} className="mt-3 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
                  Buy
                </BuyButton>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          {monremEnabled() ? 'Secure card payment by Monrem. Need an invoice instead?' : 'Card payments open soon. Need credits now?'}{' '}
          <a href="mailto:info@loudpilot.app?subject=Buy%20credits" className="font-medium text-indigo-600 underline">
            Write to us
          </a>{' '}
          and we add them today.
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200">
        <h2 className="border-b border-zinc-100 px-5 py-3.5 font-semibold">History</h2>
        {entries.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">No credit activity yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">{REASON[e.reason] ?? e.reason}</p>
                  {e.note && <p className="text-xs text-zinc-500">{e.note}</p>}
                </div>
                <div className="text-right">
                  <p className={e.amount >= 0 ? 'font-medium text-emerald-600' : 'text-zinc-800'}>
                    {e.amount >= 0 ? '+' : ''}
                    {e.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-500">{e.createdAt.toLocaleDateString('en-GB')}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// What happened to the payment the customer just came back from.
function PaymentResult({ p, paidUntil }: { p: { status: string; kind: string; credits: number | null; statusDescription: string | null }; paidUntil: Date | null }) {
  if (p.status === 'APPROVED')
    return (
      <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
        <CheckCircle2 size={16} className="shrink-0" />
        {p.kind === 'PACK' ? `Payment received — ${p.credits?.toLocaleString('en-US')} credits added.` : `Payment received — your plan is paid until ${paidUntil?.toLocaleDateString('en-GB')}.`}
      </p>
    )
  if (p.status === 'DECLINED')
    return (
      <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
        <XCircle size={16} className="shrink-0" />
        The payment didn&apos;t go through{p.statusDescription ? `: ${p.statusDescription}` : ''}. Nothing was charged — try again or use another card.
      </p>
    )
  return (
    <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
      <Clock size={16} className="shrink-0" />
      The bank is still confirming your payment. Credits arrive as soon as it&apos;s done — refresh this page in a minute.
    </p>
  )
}
