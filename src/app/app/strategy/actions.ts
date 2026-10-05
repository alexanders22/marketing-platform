'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { aiEnabled } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { balanceOf, charge, notEnough, prices } from '@/lib/credits'
import { prisma } from '@/lib/prisma'
import { OBJECTIVES, applyGoals, applyPosts, buildPlan, setAdLaunched } from '@/lib/strategist'
import { isValidTimeZone } from '@/lib/time'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Input = z
  .object({
    goal: z.string().trim().min(10, 'Describe the goal in a sentence or two').max(1000),
    objective: z.enum(OBJECTIVES.map((o) => o.id) as [string, ...string[]]),
    budget: z.number().positive().max(10_000_000).nullable(),
    startsOn: day,
    endsOn: day,
    focus: z.string().trim().max(200).optional(),
    language: z.enum(['English', 'Georgian', 'Russian']),
    timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
  })
  .refine((v) => v.endsOn >= v.startsOn, 'The end date is before the start')
  .refine((v) => (Date.parse(v.endsOn) - Date.parse(v.startsOn)) / 86_400_000 <= 92, 'Plan up to three months at a time')

export async function createPlan(raw: z.input<typeof Input>): Promise<{ id?: string; error?: string }> {
  const { workspace, account, user, role } = await requireContext()
  const COST = await prices()
  if (role === 'EDITOR') return { error: 'Only owners and admins can create plans' }
  const parsed = Input.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  if (!aiEnabled()) return { error: 'AI is not configured' }
  const have = await balanceOf(account.id)
  if (have < COST.strategy) return { error: notEnough(COST.strategy, have) }

  let plan
  try {
    plan = await buildPlan(workspace.id, parsed.data as Parameters<typeof buildPlan>[1], user.id)
  } catch (e) {
    console.error('plan failed', e)
    return { error: 'The strategist could not finish the plan — please try again.' }
  }
  // Charged once the plan exists; if the balance moved meanwhile, the plan
  // is removed again.
  const ok = await charge(account.id, workspace.id, [{ amount: COST.strategy, reason: 'AI_TEXT', note: `Strategy plan: ${plan.title.slice(0, 80)}`, action: 'strategy', units: 1 }])
  if (!ok) {
    await prisma.strategyPlan.delete({ where: { id: plan.id } })
    return { error: notEnough(COST.strategy, await balanceOf(account.id)) }
  }
  revalidatePath('/app', 'layout')
  return { id: plan.id }
}

async function ownPlan(id: string) {
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') return null
  return prisma.strategyPlan.findFirst({ where: { id, workspaceId: workspace.id } })
}

export async function applyPlanPosts(id: string, ids?: string[]): Promise<{ error?: string; created?: number }> {
  const plan = await ownPlan(id)
  if (!plan) return { error: 'Plan not found' }
  const created = await applyPosts(plan, ids)
  revalidatePath('/app', 'layout')
  return { created }
}

export async function applyPlanGoals(id: string): Promise<{ error?: string; created?: number }> {
  const plan = await ownPlan(id)
  if (!plan) return { error: 'Plan not found' }
  const res = await applyGoals(plan)
  revalidatePath('/app', 'layout')
  return { created: res.created, ...(res.errors.length ? { error: res.errors.join(' · ') } : {}) }
}

export async function markAdLaunched(id: string, adId: string, launched: boolean): Promise<{ error?: string }> {
  const plan = await ownPlan(id)
  if (!plan) return { error: 'Plan not found' }
  await setAdLaunched(plan, adId, launched)
  revalidatePath(`/app/strategy/${id}`)
  return {}
}

export async function archivePlan(id: string): Promise<{ error?: string }> {
  const plan = await ownPlan(id)
  if (!plan) return { error: 'Plan not found' }
  await prisma.strategyPlan.update({ where: { id }, data: { status: 'ARCHIVED' } })
  revalidatePath('/app/strategy')
  return {}
}
