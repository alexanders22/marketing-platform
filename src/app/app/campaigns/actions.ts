'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  aiEnabled,
  generateBlogOutlines,
  generateCampaignPosts,
  LANGUAGES,
  TONES,
  type PlannedPost,
} from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { charge, COST, notEnough } from '@/lib/credits'
import { prisma } from '@/lib/prisma'

const NETWORKS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'TELEGRAM', 'X', 'THREADS', 'PINTEREST'] as const

const Base = z.object({
  name: z.string().trim().min(1, 'Name the campaign').max(120),
  brief: z.string().trim().min(10, 'Describe the goal in a sentence or two').max(3000),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date'),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  // Browser's offset from UTC (Date#getTimezoneOffset), so planned times are the user's local times.
  tzOffset: z.number().int().min(-840).max(840),
  tone: z.enum(TONES),
  language: z.enum(LANGUAGES),
})

const Social = Base.extend({
  weeks: z.number().int().min(1).max(8),
  postsPerWeek: z.number().int().min(1).max(7),
  channels: z.array(z.enum(NETWORKS)).max(NETWORKS.length),
})

const Blog = Base.extend({
  count: z.number().int().min(2).max(12),
  perWeek: z.number().int().min(1).max(3),
})

// Spread `perWeek` slots evenly over each week, at the chosen local time.
function slots(startsOn: string, time: string, tzOffset: number, weeks: number, perWeek: number, limit = Infinity) {
  const [y, m, d] = startsOn.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const out: Date[] = []
  for (let w = 0; w < weeks && out.length < limit; w++) {
    for (let k = 0; k < perWeek && out.length < limit; k++) {
      const day = w * 7 + Math.floor((k * 7) / perWeek)
      // Local wall time → UTC: UTC = local + offset minutes.
      out.push(new Date(Date.UTC(y, m - 1, d + day, hh, mm) + tzOffset * 60_000))
    }
  }
  return out
}

const isoDay = (d: Date, tzOffset: number) => new Date(d.getTime() - tzOffset * 60_000).toISOString().slice(0, 10)

export async function createSocialCampaign(raw: z.input<typeof Social>): Promise<{ id?: string; error?: string }> {
  const { account, workspace, brand, user } = await requireContext()
  const parsed = Social.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const c = parsed.data
  if (!aiEnabled()) return { error: 'AI generation is not connected yet.' }

  const dates = slots(c.startsOn, c.time, c.tzOffset, c.weeks, c.postsPerWeek)
  const cost = dates.length * COST.campaignPost
  if (account.creditBalance < cost) return { error: notEnough(cost, account.creditBalance) }

  // Batches of up to 14 posts keep each answer well inside the output limit.
  const planned: PlannedPost[] = []
  try {
    for (let i = 0; i < dates.length; i += 14) {
      const chunk = dates.slice(i, i + 14)
      const brief = i === 0 ? c.brief : `${c.brief}\n\nThis continues the campaign; earlier angles: ${planned.map((p) => p.angle).join('; ')}`
      planned.push(
        ...(await generateCampaignPosts(workspace.name, brand, {
          brief,
          dates: chunk.map((d) => isoDay(d, c.tzOffset)),
          tone: c.tone,
          language: c.language,
        })),
      )
    }
  } catch (e) {
    console.error('campaign generation failed', e)
    return { error: 'The AI could not plan this campaign. Please try again.' }
  }

  const made = planned.slice(0, dates.length)
  if (!(await charge(account.id, workspace.id, [{ amount: made.length * COST.campaignPost, reason: 'AI_TEXT', note: `Campaign: ${c.name}` }]))) {
    return { error: notEnough(made.length, 0) }
  }

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      kind: 'SOCIAL',
      name: c.name,
      brief: c.brief,
      startsOn: dates[0],
      endsOn: dates[dates.length - 1],
      postsPerWeek: c.postsPerWeek,
      tone: c.tone,
      language: c.language,
      status: 'ACTIVE',
      posts: {
        create: made.map((p, i) => ({
          workspaceId: workspace.id,
          kind: 'SOCIAL' as const,
          title: p.angle || null,
          content: p.caption,
          hashtags: p.hashtags.filter((h) => /^[\p{L}\p{N}_]{1,60}$/u.test(h)),
          channels: c.channels,
          scheduledAt: dates[i],
          aiGenerated: true,
          createdById: user.id,
        })),
      },
    },
  })
  revalidatePath('/app', 'layout')
  return { id: campaign.id }
}

export async function createBlogCampaign(raw: z.input<typeof Blog>): Promise<{ id?: string; error?: string }> {
  const { account, workspace, brand, user } = await requireContext()
  const parsed = Blog.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const c = parsed.data
  if (!aiEnabled()) return { error: 'AI generation is not connected yet.' }

  const weeks = Math.ceil(c.count / c.perWeek)
  const dates = slots(c.startsOn, c.time, c.tzOffset, weeks, c.perWeek, c.count)
  const cost = dates.length * COST.blogOutline
  if (account.creditBalance < cost) return { error: notEnough(cost, account.creditBalance) }

  let outlines
  try {
    outlines = await generateBlogOutlines(workspace.name, brand, { brief: c.brief, count: dates.length, language: c.language })
  } catch (e) {
    console.error('blog plan failed', e)
    return { error: 'The AI could not plan this series. Please try again.' }
  }
  if (!(await charge(account.id, workspace.id, [{ amount: outlines.length * COST.blogOutline, reason: 'AI_BLOG', note: `Blog series: ${c.name}` }]))) {
    return { error: notEnough(outlines.length, 0) }
  }

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      kind: 'BLOG',
      name: c.name,
      brief: c.brief,
      startsOn: dates[0],
      endsOn: dates[outlines.length - 1] ?? dates[0],
      postsPerWeek: c.perWeek,
      tone: c.tone,
      language: c.language,
      status: 'ACTIVE',
      posts: {
        create: outlines.map((o, i) => ({
          workspaceId: workspace.id,
          kind: 'BLOG' as const,
          title: o.title,
          outline: o.summary,
          content: '',
          hashtags: o.keywords.map((k) => k.replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean),
          scheduledAt: dates[i],
          aiGenerated: true,
          createdById: user.id,
        })),
      },
    },
  })
  revalidatePath('/app', 'layout')
  return { id: campaign.id }
}

// Rewrites one social post of a campaign with a fresh angle.
export async function regenerateCampaignPost(postId: string): Promise<{ error?: string }> {
  const { account, workspace, brand } = await requireContext()
  const post = await prisma.post.findFirst({
    where: { id: postId, workspaceId: workspace.id, kind: 'SOCIAL', campaignId: { not: null } },
    include: { campaign: { include: { posts: { select: { id: true, title: true } } } } },
  })
  if (!post?.campaign) return { error: 'Post not found' }
  if (!aiEnabled()) return { error: 'AI generation is not connected yet.' }
  if (account.creditBalance < COST.campaignPost) return { error: notEnough(COST.campaignPost, account.creditBalance) }

  const c = post.campaign
  const others = c.posts.filter((p) => p.id !== post.id && p.title).map((p) => p.title)
  let next: PlannedPost
  try {
    ;[next] = await generateCampaignPosts(workspace.name, brand, {
      brief: `${c.brief}\n\nWrite ONE replacement post with a fresh angle, different from: ${others.join('; ')}`,
      dates: [(post.scheduledAt ?? new Date()).toISOString().slice(0, 10)],
      tone: (TONES as readonly string[]).includes(c.tone) ? (c.tone as (typeof TONES)[number]) : 'Professional',
      language: (LANGUAGES as readonly string[]).includes(c.language) ? (c.language as (typeof LANGUAGES)[number]) : 'English',
    })
  } catch (e) {
    console.error('regenerate failed', e)
    return { error: 'The AI could not rewrite this post. Please try again.' }
  }
  if (!(await charge(account.id, workspace.id, [{ amount: COST.campaignPost, reason: 'AI_TEXT', note: `Rewrite: ${c.name}` }]))) {
    return { error: notEnough(COST.campaignPost, 0) }
  }
  await prisma.post.update({
    where: { id: post.id },
    data: { title: next.angle || post.title, content: next.caption, hashtags: next.hashtags.filter((h) => /^[\p{L}\p{N}_]{1,60}$/u.test(h)) },
  })
  revalidatePath(`/app/campaigns/${c.id}`)
  return {}
}

export async function deleteCampaign(id: string, withPosts: boolean) {
  const { workspace } = await requireContext()
  const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } })
  if (!campaign) return { error: 'Campaign not found' }
  await prisma.$transaction([
    ...(withPosts ? [prisma.post.deleteMany({ where: { campaignId: id, workspaceId: workspace.id } })] : []),
    prisma.campaign.delete({ where: { id } }),
  ])
  revalidatePath('/app', 'layout')
  return {}
}
