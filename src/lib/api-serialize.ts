import type { Alert, Goal, SocialAccount } from '@prisma/client'
import { alertPayload } from './alerts'
import { metricDef } from './goal-metrics'

// Public JSON shapes of the partner API.

export const channelJson = (a: SocialAccount) => ({
  id: a.id,
  network: a.network.toLowerCase(),
  name: a.name,
  handle: a.handle,
  status: a.status.toLowerCase(),
  error: a.status === 'ACTIVE' ? null : a.lastError,
  connectedAt: a.createdAt,
})

export function goalJson(g: Goal) {
  const pct = metricDef(g.metric)?.kind === 'percent'
  // Percent metrics go out in percent, like they come in.
  const out = (v: number | null) => (v === null ? null : pct ? Math.round(v * 10000) / 100 : Math.round(v * 100) / 100)
  return {
    id: g.id,
    scope: g.scope.toLowerCase(),
    campaignId: g.adCampaignId,
    network: g.network?.toLowerCase() ?? null,
    metric: g.metric,
    atMost: g.atMost,
    target: out(g.target),
    windowDays: g.windowDays,
    active: g.active,
    status: g.status.toLowerCase(),
    actual: out(g.actual),
    checkedAt: g.checkedAt,
  }
}

export const alertJson = (a: Alert) => ({ ...alertPayload(a), read: a.readAt !== null, goalId: a.goalId })
