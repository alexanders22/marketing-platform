import 'server-only'
import { z } from 'zod'
import type { Caller } from '../access-tokens'
import { LANGUAGES, LENGTHS, TONES, aiEnabled, generatePost, type BrandAuditData, type CompanyProfile } from '../ai'
import { dashboard, type Period } from '../analytics'
import { alertJson, channelJson, goalJson, recommendationJson } from '../api-serialize'
import { COST, balanceOf, charge, notEnough } from '../credits'
import { withDossier } from '../dossier'
import { createGoalFor } from '../goal-input'
import { METRICS } from '../goal-metrics'
import { prisma } from '../prisma'
import { publishPostNow, targetsFor } from '../publisher'
import { OBJECTIVES, applyGoals, applyPosts, buildPlan, type PlanData } from '../strategist'
import { isValidTimeZone } from '../time'
import { applyRecommendation, dismissRecommendation, type ReviewData } from '../weekly'

// What an AI assistant can do in Khma, as the signed-in user in one
// workspace. Every tool re-checks roles like the app does.

export class ToolError extends Error {}

type Tool<S extends z.ZodType> = {
  name: string
  title: string
  description: string
  input: S
  readOnly?: boolean
  // Acts outside Khma (publishes to a network) or spends credits.
  openWorld?: boolean
  run: (c: NonNullable<Caller>, args: z.infer<S>) => Promise<unknown>
}

const tool = <S extends z.ZodType>(t: Tool<S>) => t
const manager = (c: NonNullable<Caller>) => {
  if (c.role === 'EDITOR') throw new ToolError('Only owners and admins of this workspace can do this.')
}
const NETWORKS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'TELEGRAM', 'X', 'THREADS', 'PINTEREST'] as const

const postJson = (p: { id: string; status: string; kind: string; title: string | null; content: string; hashtags: string[]; channels: string[]; scheduledAt: Date | null; aiGenerated: boolean }) => ({
  id: p.id,
  status: p.status.toLowerCase(),
  kind: p.kind.toLowerCase(),
  title: p.title,
  content: p.content,
  hashtags: p.hashtags,
  channels: p.channels,
  scheduledAt: p.scheduledAt,
  aiGenerated: p.aiGenerated,
})

export const TOOLS = [
  tool({
    name: 'get_overview',
    title: 'Workspace overview',
    description:
      'Start here. The company, its brand, plan and credits, connected Facebook/Instagram/ad accounts, open alerts, open recommendations and active strategy plans.',
    input: z.object({}),
    readOnly: true,
    run: async (c) => {
      const [channels, alerts, recs, plans] = await Promise.all([
        prisma.socialAccount.findMany({ where: { workspaceId: c.workspace.id } }),
        prisma.alert.count({ where: { workspaceId: c.workspace.id, readAt: null } }),
        prisma.recommendation.count({ where: { workspaceId: c.workspace.id, status: 'OPEN' } }),
        prisma.strategyPlan.findMany({ where: { workspaceId: c.workspace.id, status: 'ACTIVE' }, select: { id: true, title: true, goal: true } }),
      ])
      return {
        workspace: c.workspace.name,
        you: { name: c.user.name, role: c.role.toLowerCase() },
        brand: c.brand && { website: c.brand.website, description: c.brand.description, voice: c.brand.voice, audience: c.brand.audience },
        plan: c.account.plan.toLowerCase(),
        credits: c.account.creditBalance,
        currency: c.account.currency,
        channels: channels.map(channelJson),
        unreadAlerts: alerts,
        openRecommendations: recs,
        activePlans: plans,
      }
    },
  }),
  tool({
    name: 'get_dossier',
    title: 'Company dossier',
    description: 'What Khma knows about the company: profile from its website, and the audit of 12 months of posts and ads (what works, what does not, best times, never-again list).',
    input: z.object({}),
    readOnly: true,
    run: async (c) => {
      const [profile, audit] = await Promise.all([
        prisma.brandProfile.findUnique({ where: { workspaceId: c.workspace.id } }),
        prisma.brandAudit.findFirst({ where: { workspaceId: c.workspace.id }, orderBy: { createdAt: 'desc' } }),
      ])
      return {
        profile: (profile?.data as CompanyProfile | undefined) ?? null,
        audit: (audit?.data as BrandAuditData | undefined) ?? null,
        auditedAt: audit?.createdAt ?? null,
        postsAnalysed: audit?.postsCount ?? 0,
      }
    },
  }),
  tool({
    name: 'get_analytics',
    title: 'Results',
    description: 'Ads and posts results for the last 7, 30 or 90 days with the same-length period before, daily numbers, campaigns and top posts.',
    input: z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) }),
    readOnly: true,
    run: async (c, a) => {
      const d = await dashboard(c.workspace.id, a.days as Period)
      return {
        period: { days: d.period, from: d.from, to: d.to, timeZone: d.timeZone },
        currency: d.currency,
        resultLabel: d.resultLabel,
        current: d.current,
        previous: d.previous,
        daily: d.series,
        campaigns: d.campaigns.map((x) => ({ id: x.id, name: x.name, status: x.status, objective: x.objective, dailyBudget: x.dailyBudget, spend: x.spend, results: x.results, resultLabel: x.resultLabel, costPerResult: x.costPerResult, ctr: x.ctr })),
        topPosts: d.topPosts.map((p) => ({ postId: p.id, network: p.network, text: p.text, date: p.date, reach: p.reach, engagements: p.engagements, url: p.permalink })),
      }
    },
  }),
  tool({
    name: 'list_posts',
    title: 'List posts',
    description: 'Posts in the Planner (drafts, scheduled, published, failed), newest planned date first. Optional date range (YYYY-MM-DD) and status.',
    input: z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      status: z.enum(['draft', 'scheduled', 'published', 'failed']).optional(),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    readOnly: true,
    run: async (c, a) => {
      const posts = await prisma.post.findMany({
        where: {
          workspaceId: c.workspace.id,
          ...(a.status ? { status: a.status.toUpperCase() as 'DRAFT' } : {}),
          ...(a.from || a.to ? { scheduledAt: { ...(a.from ? { gte: new Date(`${a.from}T00:00:00Z`) } : {}), ...(a.to ? { lte: new Date(`${a.to}T23:59:59Z`) } : {}) } } : {}),
        },
        orderBy: [{ scheduledAt: 'desc' }, { updatedAt: 'desc' }],
        take: a.limit,
        include: { deliveries: { include: { socialAccount: { select: { network: true, name: true } } } } },
      })
      return {
        posts: posts.map((p) => ({
          ...postJson(p),
          content: p.content.slice(0, 400),
          deliveries: p.deliveries.map((d) => ({ network: d.socialAccount.network, account: d.socialAccount.name, status: d.status, url: d.permalink, error: d.error, metrics: d.metrics })),
        })),
      }
    },
  }),
  tool({
    name: 'create_post',
    title: 'Create a post',
    description:
      'Saves a post in the Planner. Without "schedule" it is a draft (never published automatically). With schedule=true and a future scheduledAt it is published automatically to the connected accounts of the chosen networks.',
    input: z.object({
      content: z.string().min(1).max(60_000),
      hashtags: z.array(z.string().regex(/^[\p{L}\p{N}_]{1,60}$/u)).max(30).default([]),
      channels: z.array(z.enum(NETWORKS)).min(1).default(['FACEBOOK', 'INSTAGRAM']),
      scheduledAt: z.string().datetime({ offset: true }).optional().describe('ISO 8601, e.g. 2026-10-08T19:00:00+04:00'),
      schedule: z.boolean().default(false),
    }),
    run: async (c, a) => {
      if (a.schedule) {
        if (!a.scheduledAt || Date.parse(a.scheduledAt) < Date.now() - 60_000) throw new ToolError('Scheduling needs a future scheduledAt.')
        if ((await targetsFor({ workspaceId: c.workspace.id, channels: a.channels })).length === 0)
          throw new ToolError('No connected Facebook Page or Instagram account for these channels — save it as a draft instead.')
      }
      const post = await prisma.post.create({
        data: {
          workspaceId: c.workspace.id,
          kind: 'SOCIAL',
          status: a.schedule ? 'SCHEDULED' : 'DRAFT',
          content: a.content,
          hashtags: [...new Set(a.hashtags)],
          channels: a.channels,
          scheduledAt: a.scheduledAt ? new Date(a.scheduledAt) : null,
          createdById: c.user.id,
        },
      })
      return { post: postJson(post) }
    },
  }),
  tool({
    name: 'write_post_with_ai',
    title: 'Write a post with Khma AI',
    description: `Khma writes an on-brand caption and hashtags using the company dossier (what worked, what to avoid) and saves it as a Planner draft. Costs ${COST.postText} credit.`,
    input: z.object({
      brief: z.string().min(3).max(2000).describe('What the post is about'),
      tone: z.enum(TONES).default('Friendly'),
      length: z.enum(LENGTHS).default('Medium'),
      language: z.enum(LANGUAGES).default('English'),
      channels: z.array(z.enum(NETWORKS)).min(1).default(['FACEBOOK', 'INSTAGRAM']),
      scheduledAt: z.string().datetime({ offset: true }).optional(),
    }),
    openWorld: true,
    run: async (c, a) => {
      if (!aiEnabled()) throw new ToolError('AI is not configured on this server.')
      const have = await balanceOf(c.account.id)
      if (have < COST.postText) throw new ToolError(notEnough(COST.postText, have))
      const text = await generatePost(c.workspace.name, await withDossier(c.brand, c.workspace.id), {
        prompt: a.brief,
        tone: a.tone,
        length: a.length,
        language: a.language,
        aiHashtags: true,
        attachments: [],
      })
      const ok = await charge(c.account.id, c.workspace.id, [{ amount: COST.postText, reason: 'AI_TEXT', note: 'Post caption (MCP)' }])
      if (!ok) throw new ToolError(notEnough(COST.postText, await balanceOf(c.account.id)))
      const post = await prisma.post.create({
        data: {
          workspaceId: c.workspace.id,
          kind: 'SOCIAL',
          status: 'DRAFT',
          content: text.caption,
          hashtags: text.hashtags,
          channels: a.channels,
          scheduledAt: a.scheduledAt ? new Date(a.scheduledAt) : null,
          aiGenerated: true,
          createdById: c.user.id,
        },
      })
      return { post: postJson(post), creditsLeft: await balanceOf(c.account.id) }
    },
  }),
  tool({
    name: 'publish_post',
    title: 'Publish a post now',
    description: 'Publishes a saved post right now to the connected Facebook Page / Instagram account of its channels. Accounts that already have it are skipped, so this also retries failures.',
    input: z.object({ postId: z.string() }),
    openWorld: true,
    run: async (c, a) => {
      const res = await publishPostNow(c.workspace.id, a.postId)
      if (res.error) throw new ToolError(res.error)
      return res
    },
  }),
  tool({
    name: 'list_goals',
    title: 'List goals',
    description: 'Goals Khma watches hourly, with the latest actual value and status (on_track, at_risk, off_track, no_data).',
    input: z.object({}),
    readOnly: true,
    run: async (c) => ({ goals: (await prisma.goal.findMany({ where: { workspaceId: c.workspace.id }, orderBy: { createdAt: 'desc' } })).map(goalJson) }),
  }),
  tool({
    name: 'create_goal',
    title: 'Create a goal',
    description: `A target Khma checks every hour and alerts on. Metrics: ${METRICS.map((m) => `${m.id} (${m.scopes.join('/').toLowerCase()})`).join(', ')}. Percent metrics in percent (2 = 2%).`,
    input: z.object({
      scope: z.enum(['campaign', 'ads', 'posts']),
      campaignId: z.string().optional().describe('With scope campaign: an id from get_analytics campaigns'),
      network: z.enum(['facebook', 'instagram']).optional(),
      metric: z.string(),
      target: z.number().positive(),
      atMost: z.boolean().optional(),
      windowDays: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7),
    }),
    run: async (c, a) => {
      manager(c)
      const res = await createGoalFor(c.workspace.id, { ...a, scope: a.scope.toUpperCase(), network: a.network?.toUpperCase() ?? null, adCampaignId: a.campaignId }, c.user.id)
      if (res.error) throw new ToolError(res.error)
      return { goal: goalJson(res.goal!) }
    },
  }),
  tool({
    name: 'list_alerts',
    title: 'List alerts',
    description: 'Latest alerts: goals off track or recovered, rejected campaigns, lost access, failed posts, weekly reviews.',
    input: z.object({ unreadOnly: z.boolean().default(false) }),
    readOnly: true,
    run: async (c, a) => ({
      alerts: (
        await prisma.alert.findMany({ where: { workspaceId: c.workspace.id, ...(a.unreadOnly ? { readAt: null } : {}) }, orderBy: { createdAt: 'desc' }, take: 50 })
      ).map(alertJson),
    }),
  }),
  tool({
    name: 'get_weekly_review',
    title: 'Weekly review',
    description: "The latest Monday review: what happened last week and why, with recommendations (ids for apply_recommendation / dismiss_recommendation).",
    input: z.object({}),
    readOnly: true,
    run: async (c) => {
      const r = await prisma.weeklyReview.findFirst({
        where: { workspaceId: c.workspace.id },
        orderBy: { createdAt: 'desc' },
        include: { recommendations: true },
      })
      if (!r) return { review: null, note: 'No review yet — the first one arrives on Monday.' }
      return { review: { weekStart: r.weekStart, weekEnd: r.weekEnd, ...(r.data as ReviewData), recommendations: r.recommendations.map(recommendationJson) } }
    },
  }),
  tool({
    name: 'apply_recommendation',
    title: 'Apply a recommendation',
    description: 'Post and repeat recommendations become Planner drafts, goal ones start being watched; budget, creative, pause and other ones are recorded as done.',
    input: z.object({ recommendationId: z.string() }),
    run: async (c, a) => {
      manager(c)
      const rec = await prisma.recommendation.findFirst({ where: { id: a.recommendationId, workspaceId: c.workspace.id } })
      if (!rec) throw new ToolError('Recommendation not found')
      const res = await applyRecommendation(rec)
      if (res.error) throw new ToolError(res.error)
      return { applied: true, ref: res.ref ?? null }
    },
  }),
  tool({
    name: 'dismiss_recommendation',
    title: 'Dismiss a recommendation',
    description: 'Hides a recommendation from this week’s list.',
    input: z.object({ recommendationId: z.string() }),
    run: async (c, a) => {
      manager(c)
      const rec = await prisma.recommendation.findFirst({ where: { id: a.recommendationId, workspaceId: c.workspace.id } })
      if (!rec) throw new ToolError('Recommendation not found')
      await dismissRecommendation(rec)
      return { dismissed: true }
    },
  }),
  tool({
    name: 'list_plans',
    title: 'List strategy plans',
    description: 'Strategy plans made by the Khma strategist.',
    input: z.object({}),
    readOnly: true,
    run: async (c) => ({
      plans: await prisma.strategyPlan.findMany({
        where: { workspaceId: c.workspace.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, goal: true, objective: true, budget: true, currency: true, startsOn: true, endsOn: true, status: true },
      }),
    }),
  }),
  tool({
    name: 'get_plan',
    title: 'Get a strategy plan',
    description: 'A full plan: diagnosis, strategy, audiences, budget, ad campaigns with forecasts, posts and goals, with what was already applied.',
    input: z.object({ planId: z.string() }),
    readOnly: true,
    run: async (c, a) => {
      const p = await prisma.strategyPlan.findFirst({ where: { id: a.planId, workspaceId: c.workspace.id } })
      if (!p) throw new ToolError('Plan not found')
      return { plan: { id: p.id, goal: p.goal, objective: p.objective, budget: p.budget, currency: p.currency, startsOn: p.startsOn, endsOn: p.endsOn, status: p.status, ...(p.data as unknown as PlanData) } }
    },
  }),
  tool({
    name: 'create_plan',
    title: 'Ask the strategist',
    description: `The Khma strategist turns a business goal into a plan (audiences, budget, ad campaigns with forecasts from the account's own history, two weeks of posts, goals) using the company dossier. Takes about a minute. Costs ${COST.strategy} credits.`,
    input: z.object({
      goal: z.string().min(10).max(1000).describe('The goal in the owner’s words'),
      objective: z.enum(OBJECTIVES.map((o) => o.id) as [string, ...string[]]),
      budget: z.number().positive().optional().describe('Ad budget for the period, account currency'),
      startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      focus: z.string().max(200).optional(),
      language: z.enum(LANGUAGES).default('English'),
      timeZone: z.string().default('Asia/Tbilisi'),
    }),
    openWorld: true,
    run: async (c, a) => {
      manager(c)
      if (!aiEnabled()) throw new ToolError('AI is not configured on this server.')
      if (a.endsOn < a.startsOn) throw new ToolError('endsOn is before startsOn')
      if (!isValidTimeZone(a.timeZone)) throw new ToolError('Unknown time zone')
      const have = await balanceOf(c.account.id)
      if (have < COST.strategy) throw new ToolError(notEnough(COST.strategy, have))
      const plan = await buildPlan(
        c.workspace.id,
        { ...a, budget: a.budget ?? null, objective: a.objective as Parameters<typeof buildPlan>[1]['objective'] },
        c.user.id,
      )
      const ok = await charge(c.account.id, c.workspace.id, [{ amount: COST.strategy, reason: 'AI_TEXT', note: `Strategy plan (MCP): ${plan.title.slice(0, 80)}` }])
      if (!ok) {
        await prisma.strategyPlan.delete({ where: { id: plan.id } })
        throw new ToolError(notEnough(COST.strategy, await balanceOf(c.account.id)))
      }
      return { planId: plan.id, title: plan.title, plan: plan.data }
    },
  }),
  tool({
    name: 'apply_plan',
    title: 'Apply a plan',
    description: 'Puts a plan to work: "posts" adds its posts to the Planner as drafts at their dates; "goals" starts watching its goals.',
    input: z.object({ planId: z.string(), part: z.enum(['posts', 'goals']) }),
    run: async (c, a) => {
      manager(c)
      const plan = await prisma.strategyPlan.findFirst({ where: { id: a.planId, workspaceId: c.workspace.id } })
      if (!plan) throw new ToolError('Plan not found')
      if (a.part === 'posts') return { postsAdded: await applyPosts(plan) }
      const res = await applyGoals(plan)
      return { goalsCreated: res.created, problems: res.errors }
    },
  }),
] as const

export function toolList() {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(t.input) as Record<string, unknown>
    delete schema.$schema
    return {
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: schema,
      annotations: {
        title: t.title,
        readOnlyHint: Boolean(t.readOnly),
        destructiveHint: false,
        idempotentHint: Boolean(t.readOnly),
        openWorldHint: Boolean(t.openWorld),
      },
    }
  })
}
