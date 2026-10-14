import type { Metadata } from 'next'
import Link from 'next/link'
import { Coins } from 'lucide-react'
import { PageHeader } from '@/components/EmptyState'
import { requireContext } from '@/lib/context'
import { creditMoney } from '@/lib/money'
import { creditValue, getPlans, getPricing } from '@/lib/credits'
import { VAT } from '@/lib/tax'
import { prisma } from '@/lib/prisma'

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

export default async function CreditsPage() {
  const { account } = await requireContext()
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

  return (
    <div className="max-w-3xl">
      <PageHeader title="Plan & credits" sub="AI generation spends credits. Your plan refills them every month." />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-5">
          <p className="text-sm text-zinc-500">Plan</p>
          <p className="mt-1 text-2xl font-semibold">{plan ? plan.name : 'No plan yet'}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {plan && trial
              ? `Free trial until ${account.trialEndsAt!.toLocaleDateString('en-GB')}`
              : plan
                ? `${account.billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly'} billing`
                : 'Pick a plan to start your free trial.'}
          </p>
          <Link
            href="/app/plan"
            className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
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
                <button disabled title="Card payments are being set up" className="mt-3 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                  Buy
                </button>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Card payments open soon. Need credits now?{' '}
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
