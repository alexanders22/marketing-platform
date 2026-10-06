'use server'

import { revalidatePath } from 'next/cache'
import { aiEnabled, explainResults, LANGUAGES, type ResultsExplanation } from '@/lib/ai'
import { aiError } from '@/lib/ai-health'
import { campaignActuals, planActuals } from '@/lib/actuals'
import { requireContext } from '@/lib/context'
import { balanceOf, charge, notEnough, prices } from '@/lib/credits'
import { withDossier } from '@/lib/dossier'
import { prisma } from '@/lib/prisma'

// The AI's reading of a plan-vs-actual comparison. 1 credit.
export async function explainComparison(kind: 'plan' | 'campaign', id: string, language: string): Promise<{ explanation?: ResultsExplanation; error?: string }> {
  const { workspace, account, brand } = await requireContext()
  const COST = await prices()
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  const have = await balanceOf(account.id)
  if (have < COST.summary) return { error: notEnough(COST.summary, have) }
  let comparison
  let goal: string
  if (kind === 'plan') {
    const plan = await prisma.strategyPlan.findFirst({ where: { id, workspaceId: workspace.id } })
    if (!plan) return { error: 'Plan not found' }
    comparison = await planActuals(plan)
    goal = plan.goal
  } else {
    const c = await prisma.campaign.findFirst({ where: { id, workspaceId: workspace.id }, include: { posts: { select: { id: true } } } })
    if (!c) return { error: 'Campaign not found' }
    comparison = await campaignActuals(c)
    goal = c.brief
  }
  let explanation: ResultsExplanation
  try {
    explanation = await explainResults(workspace.name, await withDossier(brand, workspace.id), { goal, ...comparison }, LANGUAGES.find((l) => l === language) ?? 'English')
  } catch (e) {
    console.error('explainResults failed', e)
    return { error: aiError(e, 'The results could not be explained. Try again.') }
  }
  await charge(account.id, workspace.id, [{ amount: COST.summary, reason: 'AI_TEXT', note: 'Plan vs actual explained', action: 'summary', units: 1 }])
  revalidatePath('/app', 'layout')
  return { explanation }
}
