import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, Clock, Coins, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/EmptyState'
import { savedAddress } from '@/lib/billing-address'
import { requireContext } from '@/lib/context'
import { creditMoney } from '@/lib/money'
import { creditValue, getPlans, getPricing } from '@/lib/credits'
import { VAT } from '@/lib/tax'
import { prisma } from '@/lib/prisma'
import { monremCurrency, monremEnabled } from '@/lib/monrem'
import { recurringOption, syncPayment, TEST_PAYMENT } from '@/lib/payments'
import { convertRemaining } from '@/lib/billing'
import { billingState, yearlyTotal } from '@/lib/plans'
import { priceLabel } from '@/lib/pricing'
import { BillingAddressLine } from './AddressDialog'
import { BuyButton } from './BuyButton'
import { EscapeFrame } from './PayFrame'
import { CancelRenewal, PlanPay } from './PlanPay'
import { ShowMore } from '@/components/ShowMore'

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
  const { account: acct, role, user, asAdmin } = await requireContext()
  const q = await searchParams
  // Back from Monrem's payment page: ask Monrem if the callback hasn't arrived yet.
  let paid = typeof q.payment === 'string' ? await prisma.payment.findFirst({ where: { id: q.payment, accountId: acct.id } }) : null
  if (paid?.status === 'PENDING' && monremEnabled()) paid = await syncPayment(paid.id)
  // Re-read: a fulfilled payment changed the balance or the plan.
  const account = paid ? await prisma.account.findUniqueOrThrow({ where: { id: acct.id } }) : acct
  const canPay = monremEnabled() && (role === 'OWNER' || role === 'ADMIN')
  const billing = savedAddress(account.billingAddress)
  const cantPay = !monremEnabled() ? 'Card payments are being set up' : !canPay ? 'Only the account owner or an admin can pay' : undefined
  const entries = await prisma.creditEntry.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  const [plans, pricing, value] = await Promise.all([getPlans(), getPricing(), creditValue()])
  const plan = plans.find((p) => p.id === account.plan)
  const worth = creditMoney(account.creditBalance, value)
  // Plan prices in what the card is charged in; VAT is added at checkout.
  const cur = monremCurrency()
  const monthly = plan && `${priceLabel({ usd: plan.monthly, gel: plan.monthlyGel }, cur)} + VAT`
  const yearly = plan && `${priceLabel({ usd: yearlyTotal(plan.monthly), gel: yearlyTotal(plan.monthlyGel) }, cur)} + VAT`
  const trial = account.trialEndsAt && account.trialEndsAt > new Date()
  const active = billingState(account) === 'active'
  const upgradeTo = plans.find((p) => p.id === q.upgrade && p.id !== account.plan)
  const upgrade =
    upgradeTo && plan && account.paidUntil
      ? (() => {
          const now = new Date()
          const converted = convertRemaining(account.paidUntil, cur === 'GEL' ? plan.monthlyGel : plan.monthly, cur === 'GEL' ? upgradeTo.monthlyGel : upgradeTo.monthly, now)!
          const days = (d: Date) => Math.max(0, Math.round((d.getTime() - now.getTime()) / 86_400_000))
          return { plan: upgradeTo, cycle: q.cycle === 'YEARLY' ? ('YEARLY' as const) : ('MONTHLY' as const), daysLeft: days(account.paidUntil), daysConverted: days(converted) }
        })()
      : null
  const renewing = await prisma.subscription.findFirst({ where: { accountId: account.id, status: 'ACTIVE' } })
  const renew = plan && !renewing ? { MONTHLY: Boolean(await recurringOption(plan.id, 'MONTHLY')), YEARLY: Boolean(await recurringOption(plan.id, 'YEARLY')) } : { MONTHLY: false, YEARLY: false }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Plan & credits" sub="AI generation spends credits. Your plan refills them every month." />

      {paid && <EscapeFrame />}
      {paid && <PaymentResult p={paid} paidUntil={account.paidUntil} />}
      {/* A dearer plan picked once the account has paid: bought, with the rest of the old plan converted. */}
      {upgrade && plan && (
        <section aria-label="Upgrade your plan" className="mb-4 rounded-xl bg-indigo-50 p-4 ring-1 ring-indigo-200">
          <p className="font-semibold text-indigo-950">Upgrade to {upgrade.plan.name}</p>
          <p className="mt-0.5 text-sm text-indigo-900">
            {active
              ? `The ${upgrade.daysLeft} days left of ${plan.name} become ${upgrade.daysConverted} days of ${upgrade.plan.name}, and a ${upgrade.cycle === 'YEARLY' ? 'year' : 'month'} is added on top.`
              : `Your ${plan.name} plan has ended — a ${upgrade.cycle === 'YEARLY' ? 'year' : 'month'} of ${upgrade.plan.name} starts today.`}
          </p>
          <div className="mt-3">
            <BuyButton
              purchase={{ kind: 'PLAN', plan: upgrade.plan.id, cycle: upgrade.cycle }}
              disabled={cantPay}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Pay for {upgrade.plan.name} ·{' '}
              {upgrade.cycle === 'YEARLY'
                ? `${priceLabel({ usd: yearlyTotal(upgrade.plan.monthly), gel: yearlyTotal(upgrade.plan.monthlyGel) }, cur)} + VAT / year`
                : `${priceLabel({ usd: upgrade.plan.monthly, gel: upgrade.plan.monthlyGel }, cur)} + VAT / month`}
            </BuyButton>
          </div>
        </section>
      )}
      {/* From the renewal reminder email: one button for the plan and cycle they have. */}
      {q.renew === '1' && plan && !renewing && !paid && (
        <section aria-label="Renew your plan" className="mb-4 rounded-xl bg-violet-50 p-4 ring-1 ring-violet-200">
          <p className="font-semibold text-violet-950">Renew your {plan.name} plan</p>
          <p className="mt-0.5 text-sm text-violet-900">
            {active
              ? `Paid until ${account.paidUntil!.toLocaleDateString('en-GB')}. Renewing adds a ${account.billingCycle === 'YEARLY' ? 'year' : 'month'} from that date.`
              : account.paidUntil
                ? `It ended on ${account.paidUntil.toLocaleDateString('en-GB')}. Renewing starts a new ${account.billingCycle === 'YEARLY' ? 'year' : 'month'} today.`
                : `Pay to keep using your ${plan.name} plan.`}
          </p>
          <div className="mt-3">
            <BuyButton
              purchase={{ kind: 'PLAN', plan: plan.id, cycle: account.billingCycle }}
              disabled={cantPay}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Renew 1 {account.billingCycle === 'YEARLY' ? `year · ${yearly}` : `month · ${monthly}`}
            </BuyButton>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-5">
          <p className="text-sm text-zinc-500">Plan</p>
          <p className="mt-1 text-2xl font-semibold">{plan ? plan.name : 'No plan yet'}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {plan && active
              ? `Paid until ${account.paidUntil!.toLocaleDateString('en-GB')}`
              : plan && trial
                ? `Free trial until ${account.trialEndsAt!.toLocaleDateString('en-GB')}`
                : plan && account.paidUntil
                  ? `Ended on ${account.paidUntil.toLocaleDateString('en-GB')}`
                  : plan
                  ? `${account.billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly'} billing`
                  : 'Pick a plan to start your free trial.'}
          </p>
          {renewing ? (
            <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
              <p>
                Renews automatically every {renewing.cycle === 'YEARLY' ? 'year' : 'month'}
                {account.paidUntil ? ` — next charge around ${account.paidUntil.toLocaleDateString('en-GB')}` : ''}.
              </p>
              {canPay && (
                <div className="mt-1">
                  <CancelRenewal until={account.paidUntil?.toLocaleDateString('en-GB') ?? 'the end of the paid period'} />
                </div>
              )}
            </div>
          ) : (
            plan && <PlanPay plan={plan.id} monthly={monthly!} yearly={yearly!} renew={renew} active={active} disabled={cantPay} />
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
        <p className="mt-0.5 text-sm text-zinc-500">On top of your plan, they never expire. Prices without VAT: {Math.round(VAT.rate * 100)}% is added at checkout.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Credit packs">
          {pricing.packs.map((pk) => {
            const save = 1 - pk.priceUsd / (pk.credits * pricing.creditPriceUsd)
            return (
              <li key={pk.credits} className="relative flex flex-col rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                {save >= 0.05 && <span className="absolute -top-2.5 right-3 rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">Save {Math.round(save * 100)}%</span>}
                <p className="text-lg font-semibold">{pk.credits.toLocaleString()} credits</p>
                <p className="mt-1 text-2xl font-semibold" data-no-credit-hint>
                  ₾{pk.priceGel.toLocaleString('en-US')} <span className="text-sm font-normal text-zinc-500">· ${pk.priceUsd.toLocaleString('en-US')}</span>
                </p>
                <p className="text-xs text-zinc-500" data-no-credit-hint>
                  ₾{((pk.priceGel / pk.credits) * 100).toFixed(2)} per 100 credits
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
        {canPay && billing && <BillingAddressLine address={billing} />}
      </section>

      {/* Real ₾1 charges to try the whole flow; only super admins, in their own account. */}
      {canPay && user.role === 'SUPER_ADMIN' && !asAdmin && (
        <section aria-label="Test payments" className="mt-6 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-5">
          <h2 className="font-semibold text-amber-950">Test payments</h2>
          <p className="mt-0.5 text-sm text-amber-900">
            Only super admins see this. A real card charge of 1.00 in the terminal&apos;s currency, booked like any payment.
            {plan && ` The plan test adds a month of ${plan.name} and its ${plan.credits.toLocaleString('en-US')} credits.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <div>
              <BuyButton purchase={{ kind: 'PACK', credits: TEST_PAYMENT.credits, test: true }} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600">
                Test pack · {TEST_PAYMENT.credits} credits for 1.00
              </BuyButton>
            </div>
            {plan && (
              <div>
                <BuyButton purchase={{ kind: 'PLAN', plan: plan.id, cycle: 'MONTHLY', test: true }} className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                  Test plan · {plan.name} 1 month for 1.00
                </BuyButton>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mt-6 rounded-xl border border-zinc-200">
        <h2 className="border-b border-zinc-100 px-5 py-3.5 font-semibold">History</h2>
        {entries.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">No credit activity yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            <ShowMore as="li">
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
            </ShowMore>
          </ul>
        )}
      </section>
    </div>
  )
}

// What happened to the payment the customer just came back from.
function PaymentResult({ p, paidUntil }: { p: { status: string; kind: string; credits: number | null; statusDescription: string | null; recurringRef: string | null }; paidUntil: Date | null }) {
  if (p.status === 'APPROVED')
    return (
      <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
        <CheckCircle2 size={16} className="shrink-0" />
        {p.kind === 'PACK' ? `Payment received — ${p.credits?.toLocaleString('en-US')} credits added.` : `Payment received — your plan is paid until ${paidUntil?.toLocaleDateString('en-GB')}${p.recurringRef ? ' and renews automatically' : ''}.`}
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
