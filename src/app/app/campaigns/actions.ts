'use server'

import { withDossier } from '@/lib/dossier'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
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
import { balanceOf, charge, notEnough, prices } from '@/lib/credits'
import { prisma } from '@/lib/prisma'
import { BATCH, chunks, pairWithDates, slots, startsInPast } from '@/lib/campaign-plan'
import { dayIn, isValidTimeZone } from '@/lib/time'
import { aiError } from '@/lib/ai-health'
import { generateCampaignImages } from '@/lib/campaign-images'
import { IMAGE_STYLE_IDS, type ImageStyle } from '@/lib/image-styles'
import { templatePhotos } from '@/lib/template-photos'
import { CTA_TYPES, CtaInput } from '@/lib/cta'

const NETWORKS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'TELEGRAM', 'X', 'THREADS', 'PINTEREST'] as const

const Base = z.object({
  name: z.string().trim().min(1, 'Name the campaign').max(120),
  brief: z.string().trim().min(10, 'Describe the goal in a sentence or two').max(3000),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a posting time'),
  // Browser's IANA zone, so planned times are the user's local times (DST included).
  timeZone: z.string().max(64).refine(isValidTimeZone, 'Unknown time zone'),
  tone: z.enum(TONES),
  language: z.enum(LANGUAGES),
})

const Social = Base.extend({
  weeks: z.number().int().min(1).max(8),
  postsPerWeek: z.number().int().min(1).max(7),
  channels: z.array(z.enum(NETWORKS)).max(NETWORKS.length),
  // Every post ends with it (links tagged with UTM at publish time).
  cta: CtaInput.nullable().optional(),
})

const Blog = Base.extend({
  count: z.number().int().min(2).max(12),
  perWeek: z.number().int().min(1).max(3),
})


export async function createSocialCampaign(raw: z.input<typeof Social>): Promise<{ id?: string; error?: string }> {
  const { account, workspace, brand, user } = await requireContext()
  const COST = await prices()
  const parsed = Social.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const c = parsed.data
  if (!aiEnabled()) return { error: 'AI generation is not connected yet.' }

  if (startsInPast(c.startsOn, c.timeZone)) return { error: 'Pick a start date from today on' }
  const dates = slots(c.startsOn, c.time, c.timeZone, c.weeks, c.postsPerWeek)
  const cost = dates.length * COST.campaignPost
  if (account.creditBalance < cost) return { error: notEnough(cost, account.creditBalance) }

  // Each batch's posts are paired with that batch's own dates, so a short
  // answer only drops posts — it never shifts later posts onto other days.
  const made: { post: PlannedPost; date: Date }[] = []
  try {
    for (const [i, chunk] of chunks(dates, BATCH).entries()) {
      const base = c.cta
        ? `${c.brief}\n\nEvery post leads to this action: ${CTA_TYPES[c.cta.type].label}. The button line with the link is added automatically after the text — build up to it, don't write the link.`
        : c.brief
      const brief = i === 0 ? base : `${base}\n\nThis continues the campaign; earlier angles: ${made.map((m) => m.post.angle).join('; ')}`
      const posts = await generateCampaignPosts(workspace.name, await withDossier(brand, workspace.id), {
        brief,
        dates: chunk.map((d) => dayIn(d, c.timeZone)),
        tone: c.tone,
        language: c.language,
      })
      made.push(...pairWithDates(chunk, posts))
    }
  } catch (e) {
    console.error('campaign generation failed', e)
    return { error: aiError(e, 'The AI could not plan this campaign. Please try again.') }
  }
  if (made.length === 0) return { error: 'The AI could not plan this campaign. Please try again.' }

  if (!(await charge(account.id, workspace.id, [{ amount: made.length * COST.campaignPost, reason: 'AI_TEXT', note: `Campaign: ${c.name}`, action: 'campaignPost', units: made.length }]))) {
    return { error: notEnough(made.length, await balanceOf(account.id)) }
  }

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      kind: 'SOCIAL',
      name: c.name,
      brief: c.brief,
      startsOn: made[0].date,
      endsOn: made[made.length - 1].date,
      postsPerWeek: c.postsPerWeek,
      tone: c.tone,
      language: c.language,
      status: 'ACTIVE',
      ...(c.cta ? { cta: c.cta } : {}),
      posts: {
        create: made.map(({ post: p, date }) => ({
          workspaceId: workspace.id,
          kind: 'SOCIAL' as const,
          title: p.angle || null,
          content: p.caption,
          hashtags: p.hashtags.filter((h) => /^[\p{L}\p{N}_]{1,60}$/u.test(h)),
          channels: c.channels,
          ...(c.cta ? { cta: c.cta } : {}),
          scheduledAt: date,
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
  const COST = await prices()
  const parsed = Blog.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const c = parsed.data
  if (!aiEnabled()) return { error: 'AI generation is not connected yet.' }

  if (startsInPast(c.startsOn, c.timeZone)) return { error: 'Pick a start date from today on' }
  const weeks = Math.ceil(c.count / c.perWeek)
  const dates = slots(c.startsOn, c.time, c.timeZone, weeks, c.perWeek, c.count)
  const cost = dates.length * COST.blogOutline
  if (account.creditBalance < cost) return { error: notEnough(cost, account.creditBalance) }

  let outlines
  try {
    outlines = await generateBlogOutlines(workspace.name, await withDossier(brand, workspace.id), { brief: c.brief, count: dates.length, language: c.language })
  } catch (e) {
    console.error('blog plan failed', e)
    return { error: aiError(e, 'The AI could not plan this series. Please try again.') }
  }
  if (!(await charge(account.id, workspace.id, [{ amount: outlines.length * COST.blogOutline, reason: 'AI_BLOG', note: `Blog series: ${c.name}`, action: 'blogOutline', units: outlines.length }]))) {
    return { error: notEnough(outlines.length, await balanceOf(account.id)) }
  }

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      kind: 'BLOG',
      name: c.name,
      brief: c.brief,
      startsOn: dates[0],
      endsOn: dates[Math.min(outlines.length, dates.length) - 1],
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
          hashtags: o.keywords.map((k) => k.trim().slice(0, 80)).filter(Boolean),
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
  const COST = await prices()
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
    ;[next] = await generateCampaignPosts(workspace.name, await withDossier(brand, workspace.id), {
      brief: `${c.brief}\n\nWrite ONE replacement post with a fresh angle, different from: ${others.join('; ')}`,
      dates: [(post.scheduledAt ?? new Date()).toISOString().slice(0, 10)],
      tone: (TONES as readonly string[]).includes(c.tone) ? (c.tone as (typeof TONES)[number]) : 'Professional',
      language: (LANGUAGES as readonly string[]).includes(c.language) ? (c.language as (typeof LANGUAGES)[number]) : 'English',
    })
  } catch (e) {
    console.error('regenerate failed', e)
    return { error: aiError(e, 'The AI could not rewrite this post. Please try again.') }
  }
  if (!(await charge(account.id, workspace.id, [{ amount: COST.campaignPost, reason: 'AI_TEXT', note: `Rewrite: ${c.name}`, action: 'campaignPost', units: 1 }]))) {
    return { error: notEnough(COST.campaignPost, await balanceOf(account.id)) }
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

const Images = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('ai'),
    // null: each post's own text is the brief.
    prompt: z.string().trim().max(1000).nullable(),
    style: z.enum(IMAGE_STYLE_IDS as [ImageStyle, ...ImageStyle[]]),
  }),
  // Photos from the library (media ids) or the templates ("tpl:…"), used in order.
  z.object({ mode: z.literal('photos'), photoIds: z.array(z.string().max(60)).min(1, 'Pick at least one photo').max(30) }),
])

// Pictures for the campaign's posts that have none: AI images made in the
// background (charged per image), or chosen photos spread over the posts.
export async function addCampaignImages(campaignId: string, raw: z.input<typeof Images>): Promise<{ error?: string; started?: number }> {
  const { account, workspace } = await requireContext()
  const parsed = Images.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const opt = parsed.data
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId: workspace.id },
    include: { posts: { where: { mediaIds: { isEmpty: true } }, orderBy: { scheduledAt: 'asc' }, select: { id: true } } },
  })
  if (!campaign) return { error: 'Campaign not found' }
  const posts = campaign.posts
  if (posts.length === 0) return { error: 'Every post already has a picture' }

  if (opt.mode === 'photos') {
    const tpl = await templatePhotos(workspace.id, opt.photoIds)
    const own = await prisma.media.findMany({ where: { id: { in: opt.photoIds }, workspaceId: workspace.id, kind: 'IMAGE' }, select: { id: true } })
    const ids = opt.photoIds.map((id) => tpl.get(id)?.id ?? own.find((m) => m.id === id)?.id).filter((x): x is string => Boolean(x))
    if (ids.length === 0) return { error: 'The photos are not available' }
    await prisma.$transaction(posts.map((p, i) => prisma.post.update({ where: { id: p.id }, data: { mediaIds: [ids[i % ids.length]] } })))
    revalidatePath(`/app/campaigns/${campaign.id}`)
    return { started: 0 }
  }

  if (!aiEnabled()) return { error: 'AI generation is not connected yet.' }
  if (campaign.imageStatus === 'GENERATING' && Date.now() - campaign.updatedAt.getTime() < 30 * 60_000) return { error: 'Images are already being made' }
  const COST = await prices()
  const need = posts.length * COST.image
  if (account.creditBalance < need) return { error: notEnough(need, account.creditBalance) }
  await prisma.campaign.update({ where: { id: campaign.id }, data: { imageStatus: 'GENERATING', imagesDone: 0, imagesTotal: posts.length } })
  after(() => generateCampaignImages(campaign.id, { prompt: opt.prompt || null, style: opt.style }).catch((e) => console.error('campaign images failed', e)))
  revalidatePath(`/app/campaigns/${campaign.id}`)
  return { started: posts.length }
}
