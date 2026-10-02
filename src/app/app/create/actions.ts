'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { aiEnabled, generatePost, type GeneratedPost } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'

const POST_COST = 1

const Input = z.object({
  prompt: z.string().trim().min(3, 'Describe the post you want').max(2000),
  tone: z.enum(['Professional', 'Friendly', 'Playful', 'Bold', 'Premium']),
  length: z.enum(['Short', 'Medium', 'Long']),
  hashtags: z.boolean(),
  language: z.enum(['English', 'Georgian', 'Russian']),
})

export async function createPost(raw: z.input<typeof Input>): Promise<{ post?: GeneratedPost; error?: string }> {
  const { account, workspace, brand } = await requireContext()
  const parsed = Input.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  if (!aiEnabled()) return { error: 'AI generation is not connected yet. It will be switched on shortly.' }
  if (account.creditBalance < POST_COST) {
    return { error: 'You are out of credits. Choose a plan to get more.' }
  }

  let post: GeneratedPost
  try {
    post = await generatePost(workspace.name, brand, parsed.data)
  } catch (e) {
    console.error('generatePost failed', e)
    return { error: 'The AI could not write this post. Please try again.' }
  }

  // Charge only for a delivered result; the conditional update stops the
  // balance going negative if two generations race.
  const charged = await prisma.$transaction(async (tx) => {
    const res = await tx.account.updateMany({
      where: { id: account.id, creditBalance: { gte: POST_COST } },
      data: { creditBalance: { decrement: POST_COST } },
    })
    if (res.count === 0) return false
    await tx.creditEntry.create({
      data: { accountId: account.id, amount: -POST_COST, reason: 'AI_TEXT', workspaceId: workspace.id, note: 'Social post' },
    })
    return true
  })
  if (!charged) return { error: 'You are out of credits. Choose a plan to get more.' }

  revalidatePath('/app', 'layout')
  return { post }
}
