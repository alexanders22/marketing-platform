'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireContext } from '@/lib/context'
import { METRICS, WINDOWS } from '@/lib/goal-metrics'
import { checkGoal } from '@/lib/goals'
import { prisma } from '@/lib/prisma'

const GoalInput = z.object({
  scope: z.enum(['CAMPAIGN', 'ADS', 'POSTS']),
  adCampaignId: z.string().optional(),
  network: z.enum(['FACEBOOK', 'INSTAGRAM']).nullable().optional(),
  metric: z.string(),
  atMost: z.boolean(),
  target: z.number().positive('Target must be above zero').max(1e9),
  windowDays: z.number().int().refine((d) => WINDOWS.some((w) => w.days === d), 'Unknown window'),
})
export type GoalInput = z.input<typeof GoalInput>

export async function createGoal(raw: GoalInput): Promise<{ error?: string }> {
  const { workspace, user, role } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only owners and admins can set goals' }
  const parsed = GoalInput.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const g = parsed.data
  const def = METRICS.find((m) => m.id === g.metric)
  if (!def || !def.scopes.includes(g.scope)) return { error: 'This metric does not fit this goal' }
  if (g.scope === 'CAMPAIGN') {
    const c = await prisma.adCampaign.findFirst({ where: { id: g.adCampaignId ?? '', workspaceId: workspace.id }, select: { id: true } })
    if (!c) return { error: 'Pick a campaign' }
  }
  if ((await prisma.goal.count({ where: { workspaceId: workspace.id } })) >= 100) return { error: 'Up to 100 goals per workspace' }
  // Percent metrics are entered as 1.5 (%) and stored as 0.015.
  const target = def.kind === 'percent' ? g.target / 100 : g.target
  const goal = await prisma.goal.create({
    data: {
      workspaceId: workspace.id,
      scope: g.scope,
      adCampaignId: g.scope === 'CAMPAIGN' ? g.adCampaignId : null,
      network: g.scope === 'POSTS' ? (g.network ?? null) : null,
      metric: g.metric,
      atMost: g.atMost,
      target,
      windowDays: g.windowDays,
      createdById: user.id,
    },
  })
  await checkGoal(goal).catch((e) => console.error('first goal check failed', e))
  revalidatePath('/app', 'layout')
  return {}
}

export async function setGoalActive(id: string, active: boolean) {
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only owners and admins can change goals' }
  await prisma.goal.updateMany({ where: { id, workspaceId: workspace.id }, data: { active, ...(active ? {} : { status: 'NO_DATA' }) } })
  revalidatePath('/app', 'layout')
  return {}
}

export async function deleteGoal(id: string) {
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only owners and admins can change goals' }
  await prisma.goal.deleteMany({ where: { id, workspaceId: workspace.id } })
  revalidatePath('/app', 'layout')
  return {}
}
