'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { aiEnabled, generateBlogArticle, LANGUAGES, LENGTHS, TONES } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { charge, COST, notEnough } from '@/lib/credits'
import { prisma } from '@/lib/prisma'

const AiBlog = z.object({
  topic: z.string().trim().min(5, 'Describe the topic').max(1000),
  keywords: z.string().max(500),
  tone: z.enum(TONES),
  length: z.enum(LENGTHS),
  language: z.enum(LANGUAGES),
})

export async function createAiBlog(raw: z.input<typeof AiBlog>): Promise<{ id?: string; error?: string }> {
  const { account, workspace, brand, user } = await requireContext()
  const parsed = AiBlog.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  if (!aiEnabled()) return { error: 'AI generation is not connected yet.' }
  if (account.creditBalance < COST.blogArticle) return { error: notEnough(COST.blogArticle, account.creditBalance) }

  const keywords = parsed.data.keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 10)
  let article
  try {
    article = await generateBlogArticle(workspace.name, brand, { ...parsed.data, keywords })
  } catch (e) {
    console.error('blog generation failed', e)
    return { error: 'The AI could not write this article. Please try again.' }
  }
  if (!(await charge(account.id, workspace.id, [{ amount: COST.blogArticle, reason: 'AI_BLOG', note: 'Blog article' }]))) {
    return { error: notEnough(COST.blogArticle, 0) }
  }
  const post = await prisma.post.create({
    data: {
      workspaceId: workspace.id,
      kind: 'BLOG',
      title: article.title,
      content: article.body,
      hashtags: keywords.map((k) => k.replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean),
      aiGenerated: true,
      createdById: user.id,
    },
  })
  revalidatePath('/app', 'layout')
  return { id: post.id }
}

// Writes the full article for a blog-campaign item that is still an outline.
export async function writeArticle(postId: string): Promise<{ error?: string }> {
  const { account, workspace, brand } = await requireContext()
  const post = await prisma.post.findFirst({
    where: { id: postId, workspaceId: workspace.id, kind: 'BLOG' },
    include: { campaign: true },
  })
  if (!post) return { error: 'Article not found' }
  if (!aiEnabled()) return { error: 'AI generation is not connected yet.' }
  if (account.creditBalance < COST.blogArticle) return { error: notEnough(COST.blogArticle, account.creditBalance) }

  const c = post.campaign
  let article
  try {
    article = await generateBlogArticle(workspace.name, brand, {
      topic: [post.title, post.outline].filter(Boolean).join('\n\n'),
      keywords: post.hashtags,
      tone: (TONES as readonly string[]).includes(c?.tone ?? '') ? (c!.tone as (typeof TONES)[number]) : 'Professional',
      length: 'Medium',
      language: (LANGUAGES as readonly string[]).includes(c?.language ?? '') ? (c!.language as (typeof LANGUAGES)[number]) : 'English',
    })
  } catch (e) {
    console.error('article generation failed', e)
    return { error: 'The AI could not write this article. Please try again.' }
  }
  if (!(await charge(account.id, workspace.id, [{ amount: COST.blogArticle, reason: 'AI_BLOG', note: `Article: ${post.title}` }]))) {
    return { error: notEnough(COST.blogArticle, 0) }
  }
  await prisma.post.update({ where: { id: post.id }, data: { content: article.body, aiGenerated: true } })
  revalidatePath('/app', 'layout')
  return {}
}
