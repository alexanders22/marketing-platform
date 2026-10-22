'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { adviseBrief, aiEnabled, BRIEF_QUESTIONS, LANGUAGES, translateAdvice as translate, type BriefAdvice } from '@/lib/ai'
import { dashboard, summaryFacts } from '@/lib/analytics'
import { requireContext } from '@/lib/context'
import { charge, notEnough, prices } from '@/lib/credits'
import { withDossier } from '@/lib/dossier'
import { prisma } from '@/lib/prisma'
import { aiError } from '@/lib/ai-health'
import { holidaysBetween } from '@/lib/holidays'
import { overLimit } from '@/lib/rate-limit'

// "Suggest what to do": audiences, open questions and ideas for a post or
// campaign, from the dossier, the owner's answers and the last 30 days.
export async function getAdvice(input: {
  kind: 'post' | 'campaign'
  goal: string
  language?: string
  // After the interview: ideas from the answers, no more questions.
  final?: boolean
}): Promise<{ advice?: BriefAdvice; error?: string }> {
  const { account, workspace, brand } = await requireContext()
  const COST = await prices()
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  if (account.creditBalance < COST.advice) return { error: notEnough(COST.advice, account.creditBalance) }
  const language = LANGUAGES.find((l) => l === input.language) ?? 'English'

  const d = await dashboard(workspace.id, 30).catch(() => null)
  const posts = await prisma.socialPost.count({ where: { workspaceId: workspace.id } })
  const today = new Date().toISOString().slice(0, 10)
  const soon = holidaysBetween(today, new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)).map((h) => `${h.date} ${h.name}`)
  const facts = d && (d.current.spend > 0 || posts > 0 || d.website) ? summaryFacts(d) : 'No published posts or ads yet.'
  const performance = soon.length ? { results: facts, upcomingHolidays: soon } : facts

  let advice: BriefAdvice
  try {
    advice = await adviseBrief(workspace.name, await withDossier(brand, workspace.id), {
      kind: input.kind === 'campaign' ? 'campaign' : 'post',
      goal: input.goal.slice(0, 1000),
      performance,
      language,
      final: input.final === true,
    })
  } catch (e) {
    console.error('adviseBrief failed', e)
    return { error: aiError(e, 'The AI could not prepare suggestions. Try again.') }
  }
  const ok = await charge(account.id, workspace.id, [{ amount: COST.advice, reason: 'AI_TEXT', note: 'Marketing suggestions', action: 'advice', units: 1 }])
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

// The shape and sizes getAdvice returns (with room for a translation being
// longer), so the free translation only takes real suggestions.
const text = z.string().max(1000)
const AdviceInput = z.object({
  known: z.array(text).max(6),
  audiences: z.array(z.object({ name: text, where: text, who: text, wants: text, how: text })).max(3),
  questions: z.array(z.object({ question: text, why: text, options: z.array(text).max(4) })).max(BRIEF_QUESTIONS),
  ideas: z.array(z.object({ title: text, why: text, network: z.enum(['FACEBOOK', 'INSTAGRAM', 'BOTH']), format: text, audience: text, prompt: text, caption: text })).max(3),
})
const MAX_ADVICE_CHARS = 25_000

// Suggestions already made, in another language — free, no new analysis.
export async function translateAdvice(advice: BriefAdvice, language: string): Promise<{ advice?: BriefAdvice; error?: string }> {
  const { account } = await requireContext()
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  const lang = LANGUAGES.find((l) => l === language)
  if (!lang) return { error: 'Unknown language' }
  const parsed = AdviceInput.safeParse(advice)
  if (!parsed.success || JSON.stringify(parsed.data).length > MAX_ADVICE_CHARS) return { error: 'These suggestions cannot be translated.' }
  if (overLimit(`advice-translate:${account.id}`, 30, 3_600_000)) return { error: 'Too many translations. Try again in an hour.' }
  try {
    return { advice: await translate(parsed.data, lang) }
  } catch (e) {
    console.error('translateAdvice failed', e)
    return { error: aiError(e, 'Could not translate the suggestions. Try again.') }
  }
}
