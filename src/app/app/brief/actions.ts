'use server'

import { revalidatePath } from 'next/cache'
import { adviseBrief, aiEnabled, LANGUAGES, type BriefAdvice } from '@/lib/ai'
import { dashboard, summaryFacts } from '@/lib/analytics'
import { requireContext } from '@/lib/context'
import { charge, COST, notEnough } from '@/lib/credits'
import { withDossier } from '@/lib/dossier'
import { prisma } from '@/lib/prisma'

// "Suggest what to do": audiences, open questions and ideas for a post or
// campaign, from the dossier, the owner's answers and the last 30 days.
export async function getAdvice(input: {
  kind: 'post' | 'campaign'
  goal: string
  language?: string
}): Promise<{ advice?: BriefAdvice; error?: string }> {
  const { account, workspace, brand } = await requireContext()
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  if (account.creditBalance < COST.advice) return { error: notEnough(COST.advice, account.creditBalance) }
  const language = LANGUAGES.find((l) => l === input.language) ?? 'English'

  const d = await dashboard(workspace.id, 30).catch(() => null)
  const posts = await prisma.socialPost.count({ where: { workspaceId: workspace.id } })
  const performance = d && (d.current.spend > 0 || posts > 0) ? summaryFacts(d) : 'No published posts or ads yet.'

  let advice: BriefAdvice
  try {
    advice = await adviseBrief(workspace.name, await withDossier(brand, workspace.id), {
      kind: input.kind === 'campaign' ? 'campaign' : 'post',
      goal: input.goal.slice(0, 1000),
      performance,
      language,
    })
  } catch (e) {
    console.error('adviseBrief failed', e)
    return { error: 'The AI could not prepare suggestions. Try again.' }
  }
  const ok = await charge(account.id, workspace.id, [{ amount: COST.advice, reason: 'AI_TEXT', note: 'Marketing suggestions' }])
  if (!ok) return { error: notEnough(COST.advice, 0) }
  revalidatePath('/app', 'layout')
  return { advice }
}

// Answers to the AI's questions: kept for every future post and campaign.
export async function saveAnswers(answers: { question: string; answer: string }[]) {
  const { workspace } = await requireContext()
  for (const a of answers.slice(0, 10)) {
    const question = a.question.trim().slice(0, 200)
    const answer = a.answer.trim().slice(0, 1000)
    if (!question || !answer) continue
    await prisma.brandFact.upsert({
      where: { workspaceId_question: { workspaceId: workspace.id, question } },
      create: { workspaceId: workspace.id, question, answer },
      update: { answer },
    })
  }
  revalidatePath('/app/dossier')
  return {}
}

export async function deleteFact(id: string) {
  const { workspace } = await requireContext()
  await prisma.brandFact.deleteMany({ where: { id, workspaceId: workspace.id } })
  revalidatePath('/app/dossier')
}
