import { getPlans, getPricing } from '@/lib/credits'
import { DEFAULT_ECONOMICS, type Economics } from '@/lib/economics'
import { gelPerUsd } from '@/lib/fx'
import { TRIAL_CREDITS } from '@/lib/plans'
import { ACTION_KEYS } from '@/lib/pricing'
import { prisma } from '@/lib/prisma'
import { daysAgo, fmtDateTime } from '../shared'
import { EconomicsEditor } from './EconomicsEditor'

// Is the business making money? Fixed costs, every plan's and pack's margin,
// and how many customers it takes to break even.
export default async function AdminEconomics() {
  const [pricing, plans, rate, row, usage, paying] = await Promise.all([
    getPricing(),
    getPlans(),
    gelPerUsd(),
    prisma.setting.findUnique({ where: { key: 'economics' } }),
    prisma.creditEntry.groupBy({ by: ['action'], where: { action: { not: null }, createdAt: { gte: daysAgo(30) } }, _sum: { amount: true, units: true } }),
    prisma.account.groupBy({ by: ['plan'], where: { paidUntil: { gt: new Date() }, pausedAt: null, plan: { not: 'NONE' } }, _count: true }),
  ])
  // AI cost of one credit at last month's mix of actions.
  let credits = 0
  let cost = 0
  for (const u of usage) {
    if (!u.action || !(ACTION_KEYS as string[]).includes(u.action) || (u._sum.units ?? 0) <= 0) continue
    credits += -(u._sum.amount ?? 0)
    cost += (u._sum.units ?? 0) * pricing.actions[u.action as (typeof ACTION_KEYS)[number]].costUsd
  }
  const saved = (row?.value ?? {}) as Partial<Economics>
  const initial: Economics = { ...DEFAULT_ECONOMICS, ...saved, usagePct: { ...DEFAULT_ECONOMICS.usagePct, ...saved.usagePct }, customers: { ...DEFAULT_ECONOMICS.customers, ...saved.customers } }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Economics</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Fixed costs of the month against what every plan and credit pack leaves after VAT, card fees, taxes, partners and AI. Prices come from Pricing; $1 = ₾{rate.toFixed(4)} (National Bank of Georgia).
          {row && ` Saved ${fmtDateTime(row.updatedAt)}${row.updatedBy ? ` by ${row.updatedBy}` : ''}.`}
        </p>
      </div>
      <EconomicsEditor
        initial={initial}
        plans={plans.map((p) => ({ id: p.id, name: p.name, monthly: p.monthly, credits: p.credits }))}
        packs={pricing.packs}
        gelPerUsd={rate}
        mixCost={credits > 0 ? cost / credits : null}
        trialCredits={TRIAL_CREDITS}
        paying={Object.fromEntries(paying.map((p) => [p.plan, p._count]))}
      />
    </div>
  )
}
