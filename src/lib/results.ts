import 'server-only'
import { dashboard, type Period } from './analytics'
import { prisma } from './prisma'
import { tagReport } from './tag-report'

// Results in one place: from the first view of an ad or post to the sale,
// with what each step cost. Ads and posts come from Meta (dashboard), the
// website from the Loudpilot Tag — or Google Analytics when there is no tag.
//
// A step is null when nothing measures it yet; the page then says how to
// start measuring it.

export type Step = {
  key: 'seen' | 'clicked' | 'visited' | 'leads' | 'customers'
  label: string
  value: number | null
  prev: number | null
  // Where the number comes from, and how it splits.
  source: string
  detail?: string
}

export async function resultsOf(workspaceId: string, days: Period, now = new Date()) {
  const d = await dashboard(workspaceId, days, now)
  const site = await prisma.site.findUnique({ where: { workspaceId }, select: { id: true, lastEventAt: true } })
  const [tag, tagBefore] = site?.lastEventAt
    ? await Promise.all([tagReport(site.id, workspaceId, days, now), tagReport(site.id, workspaceId, days, new Date(now.getTime() - days * 86_400_000))])
    : [null, null]
  const c = d.current
  const p = d.previous
  const ads = d.connected.ads > 0
  const organic = d.connected.organic > 0
  const ga = d.website
  // Without the tag, the ads' own leads count (lead campaigns).
  const adLeads = /lead/i.test(d.resultLabel)

  const n = (x: number) => x.toLocaleString('en-US')
  const steps: Step[] = [
    {
      key: 'seen',
      label: 'Saw your ads and posts',
      value: ads || organic ? c.impressions + c.organicReach : null,
      prev: ads || organic ? p.impressions + p.organicReach : null,
      source: [ads && 'Meta Ads', organic && 'Facebook & Instagram'].filter(Boolean).join(' + ') || 'Meta',
      detail: ads && organic ? `ads ${n(c.impressions)} · posts ${n(c.organicReach)}` : undefined,
    },
    {
      key: 'clicked',
      label: 'Clicked',
      value: ads ? c.clicks : null,
      prev: ads ? p.clicks : null,
      source: 'Meta Ads',
      detail: organic && c.engagements ? `+ ${n(c.engagements)} reactions on posts` : undefined,
    },
    {
      key: 'visited',
      label: 'Visited the website',
      value: tag ? tag.totals.visits : ga ? ga.current.sessions : null,
      prev: tagBefore ? tagBefore.totals.visits : ga ? ga.previous.sessions : null,
      source: tag ? 'Loudpilot Tag' : 'Google Analytics',
      detail: tag ? `${n(tag.totals.fromAds)} from ads · ${n(tag.totals.visitors)} people` : undefined,
    },
    {
      key: 'leads',
      label: 'Became leads',
      value: tag ? tag.totals.leads : adLeads ? c.results : null,
      prev: tagBefore ? tagBefore.totals.leads : adLeads ? p.results : null,
      source: tag ? 'Loudpilot Tag' : 'Meta Ads (lead forms)',
    },
    {
      key: 'customers',
      label: 'Bought',
      value: tag ? tag.totals.purchases : null,
      prev: tagBefore ? tagBefore.totals.purchases : null,
      source: 'Loudpilot Tag',
      detail: tag?.totals.revenue ? `${n(Math.round(tag.totals.revenue))}${tag.totals.currency ? ` ${tag.totals.currency}` : ''} in sales` : undefined,
    },
  ]

  // Money: what the ads cost per lead and per customer, and what came back.
  const spend = ads ? c.spend : null
  const leads = steps[3].value
  const customers = steps[4].value
  const revenue = tag ? tag.totals.revenue : null
  // Return on ad spend only when sales and spend are in the same currency.
  const sameMoney = !tag?.totals.currency || !d.currency || tag.totals.currency === d.currency
  const per = (a: number | null, b: number | null) => (a !== null && b ? a / b : null)
  const money = {
    currency: d.currency ?? tag?.totals.currency ?? null,
    spend,
    prevSpend: ads ? p.spend : null,
    costPerLead: per(spend, leads),
    prevCostPerLead: per(ads ? p.spend : null, steps[3].prev),
    costPerCustomer: per(spend, customers),
    revenue,
    roas: sameMoney ? per(revenue, spend) : null,
  }

  return {
    from: d.from,
    to: d.to,
    steps,
    money,
    connected: { ads, organic, tag: Boolean(tag), ga: Boolean(ga), siteKnown: Boolean(site) },
    sources: (tag?.sources ?? []).slice(0, 6),
    campaigns: d.campaigns.slice(0, 5).map((x) => ({ id: x.id, name: x.name, status: x.status, spend: x.spend, results: x.results, resultLabel: x.resultLabel, costPerResult: x.costPerResult, perThousand: x.perThousand, currency: x.currency })),
    posts: d.topPosts.slice(0, 3),
  }
}

export type Results = Awaited<ReturnType<typeof resultsOf>>
