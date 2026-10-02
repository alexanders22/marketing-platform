'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { TRIAL_CREDITS, TRIAL_DAYS } from '@/lib/plans'

const Choice = z.object({
  plan: z.enum(['STARTER', 'TEAM', 'AGENCY']),
  cycle: z.enum(['MONTHLY', 'YEARLY']),
})

// No payment provider yet: picking a plan starts (or changes) the trial.
// Trial credits are granted once per account — the idempotency key makes a
// double click or a second plan switch a no-op.
export async function choosePlan(input: { plan: string; cycle: string }): Promise<{ error?: string }> {
  const { account, role } = await requireContext()
  if (role !== 'OWNER' && role !== 'ADMIN') return { error: 'Only the account owner can change the plan' }
  const parsed = Choice.safeParse(input)
  if (!parsed.success) return { error: 'Unknown plan' }
  const { plan, cycle } = parsed.data

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.account.findUniqueOrThrow({ where: { id: account.id } })
    await tx.account.update({
      where: { id: account.id },
      data: {
        plan,
        billingCycle: cycle,
        trialEndsAt: fresh.trialEndsAt ?? new Date(Date.now() + TRIAL_DAYS * 86_400_000),
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
