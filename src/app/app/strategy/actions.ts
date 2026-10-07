'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { aiEnabled } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { balanceOf, charge, notEnough, prices } from '@/lib/credits'
import { prisma } from '@/lib/prisma'
import { OBJECTIVES, applyGoals, applyPosts, buildPlan, setAdLaunched, type PlanData } from '@/lib/strategist'
import { generatePlanVisuals, postsWithoutVisuals, startPlanVisuals, visualsCost, visualsRunning } from '@/lib/plan-visuals'
import { isValidTimeZone } from '@/lib/time'
import { aiError } from '@/lib/ai-health'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Input = z
  .object({
    goal: z.string().trim().min(10, 'Describe the goal in a sentence or two').max(1000),
    objective: z.enum(OBJECTIVES.map((o) => o.id) as [string, ...string[]]),
    budget: z.number().positive().max(10_000_000).nullable(),
    startsOn: day,
    endsOn: day,
    // Products or services to focus on; none = the whole business.
    focus: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
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
    const { focus, ...input } = parsed.data
    plan = await buildPlan(workspace.id, { ...input, focus: focus?.join('; ') } as Parameters<typeof buildPlan>[1], user.id)
  } catch (e) {
    console.error('plan failed', e)
    return { error: aiError(e, 'The strategist could not finish the plan — please try again.') }
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

// Before posts go to the Planner with pictures and videos: AI on and enough
// credits for the ones not there yet.
async function canMakeVisuals(planId: string, posts: PlanData['posts']): Promise<string | undefined> {
  if (!aiEnabled()) return 'AI is not configured'
  const { account } = await requireContext()
  const have = await balanceOf(account.id)
  const bare = await postsWithoutVisuals(planId)
  const need = visualsCost([...posts, ...bare], await prices()).credits
  if (have < need) return notEnough(need, have)
}

// Pictures and videos for the plan's posts in the Planner that have none.
async function makeVisuals(planId: string) {
  const todo = await postsWithoutVisuals(planId)
  if (todo.length === 0) return 0
  const { image } = await prices()
  await startPlanVisuals(planId, todo.length)
  after(() => generatePlanVisuals(planId, image).catch((e) => console.error('plan visuals failed', planId, e)))
  return todo.length
}

const notApplied = (plan: { data: unknown }, ids?: string[]) => (plan.data as PlanData).posts.filter((p) => !p.postId && (!ids || ids.includes(p.id)))

export async function applyPlanPosts(id: string, ids?: string[], visuals = false): Promise<{ error?: string; created?: number }> {
  const plan = await ownPlan(id)
  if (!plan) return { error: 'Plan not found' }
  if (visuals) {
    const error = await canMakeVisuals(plan.id, notApplied(plan, ids))
    if (error) return { error }
  }
  const created = await applyPosts(plan, ids)
  if (visuals) await makeVisuals(plan.id)
  revalidatePath('/app', 'layout')
  return { created }
}

// Pictures and videos for posts already in the Planner without them.
export async function makePlanVisuals(id: string): Promise<{ error?: string; created?: number }> {
  const plan = await ownPlan(id)
  if (!plan) return { error: 'Plan not found' }
  if (visualsRunning((plan.data as unknown as PlanData).visuals)) return { error: 'Already making them' }
  const error = await canMakeVisuals(plan.id, [])
  if (error) return { error }
  const created = await makeVisuals(plan.id)
  revalidatePath(`/app/strategy/${id}`)
  return { created }
}

export async function applyPlanGoals(id: string): Promise<{ error?: string; created?: number }> {
  const plan = await ownPlan(id)
  if (!plan) return { error: 'Plan not found' }
  const res = await applyGoals(plan)
  revalidatePath('/app', 'layout')
  return { created: res.created, ...(res.errors.length ? { error: res.errors.join(' · ') } : {}) }
}

// Everything the plan can start on its own: posts into the Planner, goals
// watched. Ads stay ready-to-copy until Loudpilot can launch them itself.
export async function launchPlan(id: string, visuals = false): Promise<{ error?: string; posts?: number; goals?: number }> {
  const plan = await ownPlan(id)
  if (!plan) return { error: 'Plan not found' }
  if (visuals) {
    const error = await canMakeVisuals(plan.id, notApplied(plan))
    if (error) return { error }
  }
  const posts = await applyPosts(plan)
  if (visuals) await makeVisuals(plan.id)
  const fresh = await prisma.strategyPlan.findUniqueOrThrow({ where: { id: plan.id } })
  const goals = await applyGoals(fresh)
  revalidatePath('/app', 'layout')
  return { posts, goals: goals.created, ...(goals.errors.length ? { error: goals.errors.join(' · ') } : {}) }
}

export async function markAdLaunched(id: string, adId: string, launched: boolean, adCampaignId?: string | null): Promise<{ error?: string }> {
  const plan = await ownPlan(id)
  if (!plan) return { error: 'Plan not found' }
  if (adCampaignId && !(await prisma.adCampaign.findFirst({ where: { id: adCampaignId, workspaceId: plan.workspaceId }, select: { id: true } }))) {
    return { error: 'Campaign not found' }
  }
  await setAdLaunched(plan, adId, launched || Boolean(adCampaignId), adCampaignId)
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
