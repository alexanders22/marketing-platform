import type { Metadata } from 'next'
import Link from 'next/link'
import { Coins } from 'lucide-react'
import { PageHeader } from '@/components/EmptyState'
import { requireContext } from '@/lib/context'
import { PLANS } from '@/lib/plans'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = { title: 'Plan & credits — Khma' }

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
  const plan = PLANS.find((p) => p.id === account.plan)
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
          <p className="mt-1 text-sm text-zinc-500">
            {plan ? `${plan.credits.toLocaleString()} credits per month on ${plan.name}` : 'Trial credits arrive with your plan.'}
          </p>
        </div>
      </div>

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
