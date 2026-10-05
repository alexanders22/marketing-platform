import { ApiError, handler, json, partnerWorkspace, requirePartner } from '@/lib/api'
import { PERIODS, dashboard, type Period } from '@/lib/analytics'

// The dashboard numbers: paid and organic totals for the period and the one
// before it, daily series, campaigns and top posts.
export const GET = handler(async (req, ctx: RouteContext<'/api/v1/workspaces/[externalId]/analytics'>) => {
  const partner = await requirePartner(req)
  const ws = await partnerWorkspace(partner, (await ctx.params).externalId)
  const days = Number(new URL(req.url).searchParams.get('days') ?? 30)
  if (!PERIODS.includes(days as Period)) throw new ApiError(400, 'invalid_period', 'days must be 7, 30 or 90')
  const d = await dashboard(ws.id, days as Period)
  return json({
    period: { days: d.period, from: d.from, to: d.to, timeZone: d.timeZone },
    currency: d.currency,
    resultLabel: d.resultLabel,
    current: d.current,
    previous: d.previous,
    daily: d.series,
    campaigns: d.campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status.toLowerCase(),
      objective: c.objective,
      dailyBudget: c.dailyBudget,
      lifetimeBudget: c.lifetimeBudget,
      currency: c.currency,
      spend: c.spend,
      impressions: c.impressions,
      clicks: c.clicks,
      results: c.results,
      resultLabel: c.resultLabel,
      costPerResult: c.costPerResult,
      ctr: c.ctr,
    })),
    topPosts: d.topPosts.map((p) => ({ postId: p.id, network: p.network.toLowerCase(), text: p.text, date: p.date, reach: p.reach, engagements: p.engagements, url: p.permalink })),
    // Google Analytics, when a property is connected (else null).
    website: d.website && {
      properties: d.website.properties.map((x) => x.name),
      current: d.website.current,
      previous: d.website.previous,
      keyEvents: d.website.events,
      channels: d.website.channels,
      daily: d.website.series,
    },
  })
})
