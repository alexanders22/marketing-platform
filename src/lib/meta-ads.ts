import 'server-only'
import { decrypt } from './crypto'
import { MetaError, graph } from './meta'
import { prisma } from './prisma'
import { dayIn, isValidTimeZone } from './time'

// Reads campaigns and daily campaign insights from connected Meta ad
// accounts (ads_read) into AdCampaign / AdInsightDay.

type Action = { action_type: string; value: string }

// What counts as "the result" for each objective, in priority order.
const RESULT_BY_OBJECTIVE: Record<string, string[]> = {
  OUTCOME_LEADS: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'],
  LEAD_GENERATION: ['lead', 'onsite_conversion.lead_grouped'],
  OUTCOME_SALES: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
  CONVERSIONS: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
  OUTCOME_TRAFFIC: ['link_click'],
  LINK_CLICKS: ['link_click'],
  OUTCOME_ENGAGEMENT: ['onsite_conversion.messaging_conversation_started_7d', 'post_engagement'],
  POST_ENGAGEMENT: ['post_engagement'],
  MESSAGES: ['onsite_conversion.messaging_conversation_started_7d'],
  OUTCOME_APP_PROMOTION: ['mobile_app_install', 'app_install'],
  APP_INSTALLS: ['mobile_app_install', 'app_install'],
  VIDEO_VIEWS: ['video_view'],
}
const REACH_OBJECTIVES = ['OUTCOME_AWARENESS', 'REACH', 'BRAND_AWARENESS']

export const RESULT_LABEL: Record<string, string> = {
  lead: 'Leads',
  'onsite_conversion.lead_grouped': 'Leads',
  'offsite_conversion.fb_pixel_lead': 'Leads',
  omni_purchase: 'Purchases',
  purchase: 'Purchases',
  'offsite_conversion.fb_pixel_purchase': 'Purchases',
  link_click: 'Link clicks',
  post_engagement: 'Engagements',
  'onsite_conversion.messaging_conversation_started_7d': 'Conversations',
  mobile_app_install: 'App installs',
  app_install: 'App installs',
  video_view: 'Video views',
  reach: 'People reached',
}

export const resultLabel = (type: string | null | undefined) => (type ? (RESULT_LABEL[type] ?? 'Results') : 'Results')

// Pick the objective's result from one day's actions.
export function pickResult(objective: string | null, actions: Action[] = [], values: Action[] = [], reach = 0) {
  if (objective && REACH_OBJECTIVES.includes(objective)) return { results: reach, resultType: 'reach', revenue: 0 }
  const wanted = (objective && RESULT_BY_OBJECTIVE[objective]) || ['lead', 'omni_purchase', 'link_click']
  const type = wanted.find((t) => actions.some((a) => a.action_type === t)) ?? wanted[0]
  const results = Math.round(Number(actions.find((a) => a.action_type === type)?.value ?? 0))
  const revenue = Number(values.find((a) => a.action_type === type)?.value ?? 0)
  return { results, resultType: type, revenue }
}

// Meta budgets are strings in the currency's minor unit.
const money = (v?: string) => (v ? Number(v) / 100 : null)

type RawCampaign = {
  id: string
  name: string
  objective?: string
  effective_status?: string
  status?: string
  daily_budget?: string
  lifetime_budget?: string
  start_time?: string
  stop_time?: string
}

type RawInsight = {
  campaign_id: string
  date_start: string
  spend?: string
  impressions?: string
  reach?: string
  clicks?: string
  actions?: Action[]
  action_values?: Action[]
}

async function pages<T>(path: string, token: string, params: Record<string, string | number>) {
  const out: T[] = []
  let after: string | undefined
  for (let i = 0; i < 20; i++) {
    const r = await graph<{ data: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(path, {
      token,
      params: { ...params, after },
    })
    out.push(...r.data)
    if (!r.paging?.next) break
    after = r.paging.cursors?.after
  }
  return out
}

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

// Sync one ad account. First run reads 90 days; later runs re-read the last
// 3 days, because Meta keeps attributing results to recent days.
export async function syncAdAccount(socialAccountId: string, now = new Date()) {
  const acc = await prisma.socialAccount.findUnique({ where: { id: socialAccountId } })
  if (!acc || acc.network !== 'META_ADS' || acc.status !== 'ACTIVE' || !acc.accessTokenEnc) return { campaigns: 0, days: 0 }
  const token = decrypt(acc.accessTokenEnc)
  const meta = (acc.meta ?? {}) as { currency?: string; timeZone?: string }
  const tz = meta.timeZone && isValidTimeZone(meta.timeZone) ? meta.timeZone : 'UTC'
  const until = dayIn(now, tz)
  const since = shift(until, acc.syncedAt ? -3 : -89)

  try {
    const raw = await pages<RawCampaign>(`${acc.externalId}/campaigns`, token, {
      fields: 'id,name,objective,effective_status,status,daily_budget,lifetime_budget,start_time,stop_time',
      limit: 200,
    })
    const byExternal = new Map<string, { id: string; objective: string | null }>()
    for (const c of raw) {
      const data = {
        name: c.name,
        objective: c.objective ?? null,
        status: c.effective_status ?? c.status ?? 'UNKNOWN',
        dailyBudget: money(c.daily_budget),
        lifetimeBudget: money(c.lifetime_budget),
        currency: meta.currency ?? null,
        startsAt: c.start_time ? new Date(c.start_time) : null,
        endsAt: c.stop_time ? new Date(c.stop_time) : null,
      }
      const row = await prisma.adCampaign.upsert({
        where: { socialAccountId_externalId: { socialAccountId: acc.id, externalId: c.id } },
        create: { workspaceId: acc.workspaceId, socialAccountId: acc.id, externalId: c.id, ...data },
        update: data,
      })
      byExternal.set(c.id, { id: row.id, objective: row.objective })
    }

    const insights = await pages<RawInsight>(`${acc.externalId}/insights`, token, {
      level: 'campaign',
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      fields: 'campaign_id,date_start,spend,impressions,reach,clicks,actions,action_values',
      limit: 500,
    })
    let days = 0
    for (const r of insights) {
      const c = byExternal.get(r.campaign_id)
      if (!c) continue
      const reach = Number(r.reach ?? 0)
      const picked = pickResult(c.objective, r.actions, r.action_values, reach)
      const data = {
        spend: Number(r.spend ?? 0),
        impressions: Number(r.impressions ?? 0),
        reach,
        clicks: Number(r.clicks ?? 0),
        ...picked,
        actions: Object.fromEntries((r.actions ?? []).map((a) => [a.action_type, Number(a.value)])),
      }
      await prisma.adInsightDay.upsert({
        where: { campaignId_date: { campaignId: c.id, date: r.date_start } },
        create: { campaignId: c.id, date: r.date_start, ...data },
        update: data,
      })
      days++
    }
    await prisma.socialAccount.update({ where: { id: acc.id }, data: { syncedAt: now, lastError: null } })
    return { campaigns: raw.length, days }
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500)
    await prisma.socialAccount.update({
      where: { id: acc.id },
      data: { lastError: message, ...(e instanceof MetaError && e.needsReconnect ? { status: 'EXPIRED' } : {}) },
    })
    throw e
  }
}

// Called by the ticker: ad accounts not read in the last hour.
export async function syncAdsDue(now = new Date(), limit = 20) {
  const due = await prisma.socialAccount.findMany({
    where: {
      network: 'META_ADS',
      status: 'ACTIVE',
      OR: [{ syncedAt: null }, { syncedAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } }],
    },
    orderBy: { syncedAt: { sort: 'asc', nulls: 'first' } },
    take: limit,
    select: { id: true },
  })
  let ok = 0
  for (const a of due) {
    try {
      await syncAdAccount(a.id, now)
      ok++
    } catch (e) {
      console.error('ads sync failed', a.id, e instanceof Error ? e.message : e)
    }
  }
  return ok
}
