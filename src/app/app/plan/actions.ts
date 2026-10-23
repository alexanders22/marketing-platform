'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { convertRemaining, lockAccount, outgrows } from '@/lib/billing'
import { requireContext } from '@/lib/context'
import { getPlans } from '@/lib/credits'
import { monremCurrency } from '@/lib/monrem'
import { cancelAutoRenew } from '@/lib/payments'
import { prisma } from '@/lib/prisma'
import { TRIAL_CREDITS, TRIAL_DAYS } from '@/lib/plans'

const Choice = z.object({
  plan: z.enum(['STARTER', 'TEAM', 'AGENCY']),
  cycle: z.enum(['MONTHLY', 'YEARLY']),
})

// Picking a plan starts (or changes) the trial. Trial credits are granted
// once per account — the idempotency key makes a double click or a second
// plan switch a no-op. Once the account has paid, a dearer plan isn't picked
// but bought (pay: where to pay for it); a cheaper one applies at once, the
// unused paid time converted at the new price. A plan smaller than what the
// account already has is refused.
export async function choosePlan(input: { plan: string; cycle: string }): Promise<{ error?: string; pay?: string }> {
  const { account, role } = await requireContext()
  if (role !== 'OWNER' && role !== 'ADMIN') return { error: 'Only the account owner or an admin can change the plan' }
  const parsed = Choice.safeParse(input)
  if (!parsed.success) return { error: 'Unknown plan' }
  const { plan, cycle } = parsed.data
  const plans = await getPlans()
  const gel = monremCurrency() === 'GEL'
  const price = (id: string) => plans.find((p) => p.id === id)?.[gel ? 'monthlyGel' : 'monthly'] ?? 0
  if (plan !== account.plan) {
    const tooSmall = await outgrows(account.id, plan)
    if (tooSmall) return { error: tooSmall }
    if (account.plan !== 'NONE' && account.paidUntil && price(plan) > price(account.plan)) return { pay: `/app/credits?upgrade=${plan}&cycle=${cycle}` }
  }
  // Auto-renewal charges for one plan and cycle: a change stops it (the paid
  // period stays; the customer subscribes again to the new plan).
  if (await prisma.subscription.findFirst({ where: { accountId: account.id, status: 'ACTIVE', NOT: { plan, cycle } }, select: { id: true } })) {
    const res = await cancelAutoRenew(account.id)
    if (res.error) return { error: `Auto-renewal could not be stopped: ${res.error}` }
  }

  await prisma.$transaction(async (tx) => {
    await lockAccount(tx, account.id)
    const fresh = await tx.account.findUniqueOrThrow({ where: { id: account.id } })
    await tx.account.update({
      where: { id: account.id },
      data: {
        plan,
        billingCycle: cycle,
        trialEndsAt: fresh.trialEndsAt ?? new Date(Date.now() + TRIAL_DAYS * 86_400_000),
        paidUntil: fresh.plan !== plan ? convertRemaining(fresh.paidUntil, price(fresh.plan), price(plan)) : fresh.paidUntil,
      },
    })
    const key = `trial:${account.id}`
    if (!(await tx.creditEntry.findUnique({ where: { idempotencyKey: key }, select: { id: true } }))) {
      await tx.creditEntry.create({
        data: { accountId: account.id, amount: TRIAL_CREDITS, reason: 'GRANT', idempotencyKey: key, note: 'Free trial' },
      })
      await tx.account.update({ where: { id: account.id }, data: { creditBalance: { increment: TRIAL_CREDITS } } })
    }
  })
  revalidatePath('/app', 'layout')
  return {}
}
