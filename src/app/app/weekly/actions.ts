'use server'

import { revalidatePath } from 'next/cache'
import { aiEnabled } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { applyRecommendation, createReview, dismissRecommendation } from '@/lib/weekly'
import { aiError } from '@/lib/ai-health'

export async function reviewNow(): Promise<{ error?: string }> {
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only owners and admins can run a review' }
  if (!aiEnabled()) return { error: 'AI is not configured' }
  const last = await prisma.weeklyReview.findFirst({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
  if (last && Date.now() - last.createdAt.getTime() < 6 * 60 * 60 * 1000) return { error: 'You had a review in the last few hours — the next one is more useful with fresh numbers.' }
  try {
    await createReview(workspace.id, { rolling: true })
  } catch (e) {
    console.error('review failed', e)
    return { error: aiError(e, 'The review could not be written — please try again.') }
  }
  revalidatePath('/app', 'layout')
  return {}
}

async function ownRec(id: string) {
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') return null
  return prisma.recommendation.findFirst({ where: { id, workspaceId: workspace.id } })
}

export async function applyRec(id: string): Promise<{ error?: string; ref?: string }> {
  const rec = await ownRec(id)
  if (!rec) return { error: 'Not found' }
  const res = await applyRecommendation(rec)
  revalidatePath('/app', 'layout')
  return res
}

export async function dismissRec(id: string): Promise<{ error?: string }> {
  const rec = await ownRec(id)
  if (!rec) return { error: 'Not found' }
  await dismissRecommendation(rec)
  revalidatePath('/app', 'layout')
  return {}
}
