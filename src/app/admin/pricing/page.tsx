import { getPricing } from '@/lib/credits'
import { prisma } from '@/lib/prisma'
import { PLANS } from '@/lib/plans'
import { ACTION_KEYS } from '@/lib/pricing'
import { card, daysAgo, fmtDateTime } from '../shared'
import { PricingEditor } from './PricingEditor'

// Unit economics: what each action earns in credits vs what it costs us.
export default async function AdminPricing() {
  const [pricing, row, usage, refunded] = await Promise.all([
    getPricing(),
    prisma.setting.findUnique({ where: { key: 'pricing' } }),
    prisma.creditEntry.groupBy({
      by: ['action'],
      // Charges and their refunds (refunds carry negative units).
      where: { action: { not: null }, createdAt: { gte: daysAgo(30) } },
      _sum: { amount: true, units: true },
      _count: { _all: true },
    }),
    prisma.creditEntry.groupBy({
      by: ['action'],
      where: { action: { not: null }, reason: 'REFUND', createdAt: { gte: daysAgo(30) } },
      _count: { _all: true },
    }),
  ])
  // Times = charges minus the ones given back.
  const refundsOf = (a: string) => refunded.find((r) => r.action === a)?._count._all ?? 0
  const plans = PLANS.map((p) => ({ id: p.id, name: p.name, monthly: p.monthly, credits: p.credits }))
  const used = Object.fromEntries(
    usage
      .filter((u) => u.action && (ACTION_KEYS as string[]).includes(u.action) && (u._sum.units ?? 0) > 0)
      .map((u) => [u.action!, { credits: -(u._sum.amount ?? 0), units: u._sum.units ?? 0, count: u._count._all - 2 * refundsOf(u.action!) }]),
  )
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Pricing & unit economics</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Credits each action charges and what it costs us at the provider. Changes apply to the next charge and to every price shown in the app.
          {row && (
            <>
              {' '}
              Last change {fmtDateTime(row.updatedAt)}
              {row.updatedBy && ` by ${row.updatedBy}`}.
            </>
          )}
        </p>
      </div>
      <PricingEditor initial={pricing} plans={plans} used={used} />
      <p className={`${card} text-xs text-zinc-500`}>
        Provider costs are estimates to start from — Gemini text ~$0.001–0.03 per call, Gemini image ~$0.039, Veo 3.1 Lite/Fast/Standard per second of clip. Check your Google
        Cloud billing and put your real numbers here.
      </p>
    </div>
  )
}
