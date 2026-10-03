'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/lib/context'
import { createGoalFor, type GoalInput } from '@/lib/goal-input'
import { prisma } from '@/lib/prisma'

export async function createGoal(raw: GoalInput): Promise<{ error?: string }> {
  const { workspace, user, role } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only owners and admins can set goals' }
  const res = await createGoalFor(workspace.id, raw, user.id)
  if (res.error) return { error: res.error }
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
