'use server'

import { revalidatePath } from 'next/cache'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { composeFor, saveCorrection, saveFact } from '@/lib/business'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { goalSentence, isSlot, OBJECTIVE_IDS, type Answer, type GoalAnswer, type InterviewData } from '@/lib/interview'
import { isValidTimeZone } from '@/lib/time'
import { createPlan } from '../actions'

// Strategy interview: compose → confirm what we know → answer → goal → plan.

// Each start asks the AI once; a few a day is plenty.
const STARTS_PER_DAY = 10

async function own(id: string) {
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') return null
  const row = await prisma.strategyInterview.findFirst({ where: { id, workspaceId: workspace.id } })
  return row ? { row, data: row.data as unknown as InterviewData, workspaceId: workspace.id } : null
}

const store = (id: string, data: InterviewData) => prisma.strategyInterview.update({ where: { id }, data: { data: data as unknown as Prisma.InputJsonValue } })

// Right after onboarding the website is still being read: the interview
// waits for it (up to a minute and a half), so it can skip what the site says.
export async function profileReady(): Promise<boolean> {
  const { workspace } = await requireContext()
  const [profile, kit] = await Promise.all([
    prisma.brandProfile.count({ where: { workspaceId: workspace.id } }),
    prisma.brandKit.findUnique({ where: { workspaceId: workspace.id }, select: { website: true } }),
  ])
  return profile > 0 || !kit?.website || Date.now() - workspace.createdAt.getTime() > 10 * 60_000
}

export async function startInterview(language: string): Promise<{ id?: string; error?: string }> {
  const { workspace, user, role } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only owners and admins can plan the strategy' }
  const lang = z.enum(['English', 'Georgian', 'Russian']).catch('English').parse(language)
  const today = await prisma.strategyInterview.count({ where: { workspaceId: workspace.id, createdAt: { gt: new Date(Date.now() - 86_400_000) } } })
  if (today >= STARTS_PER_DAY) return { error: 'That’s enough interviews for today — continue the last one or try tomorrow.' }
  const data = await composeFor(workspace.id, lang)
  const row = await prisma.strategyInterview.create({
    data: { workspaceId: workspace.id, data: data as unknown as Prisma.InputJsonValue, createdById: user.id },
  })
  return { id: row.id }
}

// "What we know" is right (or here is what is different).
export async function confirmKnown(id: string, ok: boolean, correction = ''): Promise<{ data?: InterviewData; error?: string }> {
  const it = await own(id)
  if (!it || it.row.status !== 'OPEN') return { error: 'Interview not found' }
  const text = String(correction).trim().slice(0, 1000)
  if (!ok && !text) return { error: 'Say what is different' }
  const data: InterviewData = { ...it.data, confirmed: ok, correction: ok ? it.data.correction : text, step: Math.max(it.data.step, 1) }
  if (!ok) await saveCorrection(it.workspaceId, text)
  await store(id, data)
  return { data }
}

const AnswerInput = z.object({
  key: z.string(),
  value: z.union([z.number().min(0).max(1e9), z.string().trim().max(1000), z.array(z.string().trim().max(60)).max(10), z.null()]),
  label: z.string().trim().min(1).max(200),
  source: z.enum(['OWNER', 'ESTIMATE', 'SKIPPED']),
})

export async function answerQuestion(id: string, raw: z.input<typeof AnswerInput>): Promise<{ data?: InterviewData; error?: string }> {
  const it = await own(id)
  if (!it || it.row.status !== 'OPEN') return { error: 'Interview not found' }
  const parsed = AnswerInput.safeParse(raw)
  if (!parsed.success) return { error: 'Invalid answer' }
  const { key, value, label, source } = parsed.data
  const q = it.data.questions.find((x) => x.key === key)
  if (!isSlot(key) || !q) return { error: 'Unknown question' }
  if (source !== 'SKIPPED') {
    const numeric = q.kind === 'money' || q.kind === 'number' || q.kind === 'percent'
    const ok =
      (numeric && typeof value === 'number' && (q.kind !== 'percent' || value <= 100)) ||
      (q.kind === 'multi' && Array.isArray(value) && value.length > 0) ||
      ((q.kind === 'choice' || q.kind === 'text') && typeof value === 'string' && value.length > 0)
    if (!ok) return { error: 'Invalid answer' }
  }
  const answer: Answer = { value: source === 'SKIPPED' ? null : value, label, source }
  const data: InterviewData = { ...it.data, answers: { ...it.data.answers, [key]: answer }, step: Math.max(it.data.step, 1) + 1 }
  if (source !== 'SKIPPED') await saveFact(it.workspaceId, key, answer)
  await store(id, data)
  return { data }
}

// Back one question: the answer is asked again (the saved fact is replaced then).
export async function undoAnswer(id: string, key: string): Promise<{ data?: InterviewData; error?: string }> {
  const it = await own(id)
  if (!it || it.row.status !== 'OPEN' || !isSlot(key)) return { error: 'Interview not found' }
  const answers = { ...it.data.answers }
  if (!answers[key]) return { data: it.data }
  delete answers[key]
  const data: InterviewData = { ...it.data, answers, step: Math.max(1, it.data.step - 1) }
  await store(id, data)
  return { data }
}

const GoalInput = z.object({
  objective: z.enum(OBJECTIVE_IDS),
  target: z.number().int().min(1).max(1_000_000).nullable(),
  months: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  monthlyBudget: z.number().min(1).max(10_000_000).nullable(),
  focus: z.array(z.string().trim().min(1).max(200)).max(20),
  stretch: z.boolean(),
})

const iso = (d: Date) => d.toISOString().slice(0, 10)

// The goal goes to the strategist with everything the owner told us; the
// plan is charged like any other plan.
export async function buildFromInterview(id: string, raw: GoalAnswer, timeZone: string): Promise<{ planId?: string; error?: string }> {
  const it = await own(id)
  if (!it) return { error: 'Interview not found' }
  if (it.row.status === 'DONE' && it.row.planId) return { planId: it.row.planId }
  const parsed = GoalInput.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const goal = parsed.data
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const end = iso(new Date(Date.parse(`${today}T00:00:00Z`) + (goal.months * 30 - 1) * 86_400_000))
  const data: InterviewData = { ...it.data, goal }
  await store(id, data)

  const res = await createPlan({
    goal: goalSentence(data, goal),
    objective: goal.objective,
    budget: goal.monthlyBudget ? goal.monthlyBudget * goal.months : null,
    startsOn: today,
    endsOn: end,
    focus: goal.focus,
    language: data.language,
    timeZone: tz,
  })
  if (res.error || !res.id) return { error: res.error ?? 'The plan could not be built' }
  await prisma.strategyInterview.update({ where: { id }, data: { status: 'DONE', planId: res.id } })
  revalidatePath('/app/strategy')
  return { planId: res.id }
}
