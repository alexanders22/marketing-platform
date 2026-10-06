import 'server-only'
import { z } from 'zod'
import { METRICS, WINDOWS } from './goal-metrics'
import { checkGoal } from './goals'
import { prisma } from './prisma'

// One validation path for goals created in the app and through the API.
export const GoalInput = z.object({
  scope: z.enum(['CAMPAIGN', 'ADS', 'POSTS', 'WEBSITE']),
  adCampaignId: z.string().optional(),
  network: z.enum(['FACEBOOK', 'INSTAGRAM']).nullable().optional(),
  // WEBSITE: one Google Analytics key event (e.g. sign_up), else all of them.
  event: z.string().regex(/^[A-Za-z0-9_]{1,60}$/, 'Unknown event name').nullable().optional(),
  metric: z.string(),
  // Defaults to the metric's natural direction (costs at most, rest at least).
  atMost: z.boolean().optional(),
  // Percent metrics in percent (1.5 = 1.5%).
  target: z.number().positive('Target must be above zero').max(1e9),
  windowDays: z
    .number()
    .int()
    .refine((d) => WINDOWS.some((w) => w.days === d), 'windowDays must be 1, 7 or 30')
    .default(7),
})
export type GoalInput = z.input<typeof GoalInput>

export async function createGoalFor(workspaceId: string, raw: unknown, createdById?: string) {
  const parsed = GoalInput.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const g = parsed.data
  const def = METRICS.find((m) => m.id === g.metric)
  if (!def) return { error: `Unknown metric "${g.metric}"` }
  if (!def.scopes.includes(g.scope)) return { error: `Metric "${g.metric}" does not apply to scope ${g.scope}` }
  if (g.scope === 'CAMPAIGN') {
    const c = await prisma.adCampaign.findFirst({ where: { id: g.adCampaignId ?? '', workspaceId }, select: { id: true } })
    if (!c) return { error: 'Pick a campaign' }
  }
  if (g.scope === 'WEBSITE' && !(await prisma.socialAccount.count({ where: { workspaceId, network: 'GOOGLE_ANALYTICS' } }))) {
    return { error: 'Connect Google Analytics first' }
  }
  if ((await prisma.goal.count({ where: { workspaceId } })) >= 100) return { error: 'Up to 100 goals per workspace' }
  const goal = await prisma.goal.create({
    data: {
      workspaceId,
      scope: g.scope,
      adCampaignId: g.scope === 'CAMPAIGN' ? g.adCampaignId : null,
      network: g.scope === 'POSTS' ? (g.network ?? null) : g.scope === 'WEBSITE' && g.metric !== 'site_visits' && g.metric !== 'site_new_users' ? (g.event ?? null) : null,
      metric: g.metric,
      atMost: g.atMost ?? def.atMost,
      target: def.kind === 'percent' ? g.target / 100 : g.target,
      windowDays: g.windowDays,
      createdById,
    },
  })
  await checkGoal(goal).catch((e) => console.error('first goal check failed', e))
  return { goal: await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } }) }
}
