import 'server-only'
import { BOOST_GOALS, type BoostSettings } from './boost-options'
import { decrypt } from './crypto'
import { MetaError, graph } from './meta'
import { resultLabel } from './meta-ads'
import { prisma } from './prisma'

// Boost: promote a published Facebook or Instagram post with the
// workspace's Meta ad account. Marketing API, in order:
//   campaign (objective, special ad category)
//   → ad set (budget, schedule, audience, placements)
//   → creative built from the existing post (object_story_id / IG media)
//   → ad.
// Needs the ads_management permission on the ad account connection.

export const BOOST_PERMISSION = 'ads_management'

// Currencies Meta counts in whole units (no cents).
const WHOLE_UNITS = new Set(['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND'])
const minor = (amount: number, currency: string | null) => Math.round(amount * (currency && WHOLE_UNITS.has(currency) ? 1 : 100))

export type AdAccountChoice = { id: string; name: string; currency: string | null; canBoost: boolean; problem: string | null }

// The workspace's ad accounts and whether each can boost right now.
export async function boostAccounts(workspaceId: string): Promise<AdAccountChoice[]> {
  const rows = await prisma.socialAccount.findMany({
    where: { workspaceId, network: 'META_ADS' },
    select: { id: true, name: true, meta: true, status: true, scopes: true },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((a) => {
    const problem =
      a.status !== 'ACTIVE'
        ? 'The connection expired — reconnect Meta in Channels.'
        : !a.scopes.includes(BOOST_PERMISSION)
          ? 'Loudpilot may read this ad account but not create ads. Reconnect Meta and allow "Manage ads".'
          : null
    return { id: a.id, name: a.name, currency: ((a.meta ?? {}) as { currency?: string }).currency ?? null, canBoost: !problem, problem }
  })
}

type Delivery = {
  id: string
  status: string
  externalId: string | null
  post: { content: string }
  socialAccount: { network: string; externalId: string; parentId: string | null }
}

export const canBeBoosted = (d: Pick<Delivery, 'status' | 'externalId'> & { network: string }) =>
  d.status === 'PUBLISHED' && !!d.externalId && (d.network === 'FACEBOOK' || d.network === 'INSTAGRAM')

// The ad creative: the post itself, as published.
function creativeOf(d: Delivery) {
  const acc = d.socialAccount
  if (acc.network === 'INSTAGRAM') {
    if (!acc.parentId) throw new Error('This Instagram account has no Facebook Page; reconnect Meta in Channels.')
    return { object_id: acc.parentId, instagram_user_id: acc.externalId, source_instagram_media_id: d.externalId! }
  }
  // Videos are published as "{video id}"; their post is "{page}_{video}".
  return { object_story_id: d.externalId!.includes('_') ? d.externalId! : `${acc.externalId}_${d.externalId}` }
}

export function boostDates(s: Pick<BoostSettings, 'startsOn' | 'days'>, now = new Date()) {
  const start = s.startsOn && s.startsOn > now.toISOString().slice(0, 10) ? new Date(`${s.startsOn}T00:00:00Z`) : now
  return { start, end: new Date(start.getTime() + s.days * 86_400_000) }
}

export async function createBoost(workspaceId: string, userId: string | null, s: BoostSettings) {
  const d = await prisma.postDelivery.findFirst({
    where: { id: s.deliveryId, post: { workspaceId } },
    include: { post: { select: { content: true } }, socialAccount: { select: { network: true, externalId: true, parentId: true } } },
  })
  if (!d || !canBeBoosted({ ...d, network: d.socialAccount.network })) return { error: 'Only a published Facebook or Instagram post can be boosted.' }
  const running = await prisma.boost.findFirst({ where: { deliveryId: d.id, status: { in: ['ACTIVE', 'PAUSED'] }, endsAt: { gt: new Date() } } })
  if (running) return { error: 'This post is already boosted. Pause or wait for that boost to end.' }

  const acc = await prisma.socialAccount.findFirst({ where: { id: s.adAccountId, workspaceId, network: 'META_ADS' } })
  const choice = acc && (await boostAccounts(workspaceId)).find((a) => a.id === acc.id)
  if (!acc || !choice || !acc.accessTokenEnc) return { error: 'Pick a connected ad account.' }
  if (choice.problem) return { error: choice.problem }

  const token = decrypt(acc.accessTokenEnc)
  const currency = choice.currency
  const goal = BOOST_GOALS[s.goal]
  const special = s.category !== 'NONE'
  const { start, end } = boostDates(s)
  const status = s.paused ? 'PAUSED' : 'ACTIVE'
  const title = d.post.content.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Post'
  const name = `Boost · ${title} · ${start.toISOString().slice(0, 10)}`
  const audience = {
    countries: s.countries,
    // A special category locks the audience to everyone 18–65.
    ageMin: special ? 18 : s.ageMin,
    ageMax: special ? 65 : s.ageMax,
    gender: special ? 'ALL' : s.gender,
    placements: s.placements,
    category: s.category,
  }
  const targeting = {
    geo_locations: { countries: s.countries },
    age_min: audience.ageMin,
    age_max: audience.ageMax,
    ...(audience.gender === 'MEN' ? { genders: [1] } : audience.gender === 'WOMEN' ? { genders: [2] } : {}),
    ...(s.placements === 'NETWORK_ONLY' ? { publisher_platforms: [d.socialAccount.network === 'INSTAGRAM' ? 'instagram' : 'facebook'] } : {}),
    targeting_automation: { advantage_audience: 0 },
  }

  const boost = await prisma.boost.create({
    data: {
      workspaceId,
      deliveryId: d.id,
      adAccountId: acc.id,
      goal: s.goal,
      dailyBudget: s.dailyBudget,
      currency,
      startsAt: start,
      endsAt: end,
      audience,
      status: 'FAILED',
      createdById: userId,
    },
  })

  let campaignId: string | null = null
  try {
    campaignId = (
      await graph<{ id: string }>(`${acc.externalId}/campaigns`, {
        token,
        method: 'POST',
        params: {
          name,
          objective: goal.objective,
          status,
          special_ad_categories: JSON.stringify(special ? [s.category] : []),
          ...(special ? { special_ad_category_country: JSON.stringify(s.countries) } : {}),
          is_adset_budget_sharing_enabled: false,
        },
      })
    ).id
    const adSet = await graph<{ id: string }>(`${acc.externalId}/adsets`, {
      token,
      method: 'POST',
      params: {
        name,
        campaign_id: campaignId,
        daily_budget: minor(s.dailyBudget, currency),
        billing_event: 'IMPRESSIONS',
        optimization_goal: goal.optimization,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        ...(s.goal === 'ENGAGEMENT' ? { destination_type: 'ON_POST' } : {}),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        targeting: JSON.stringify(targeting),
        status,
      },
    })
    const creative = await graph<{ id: string }>(`${acc.externalId}/adcreatives`, {
      token,
      method: 'POST',
      params: { name, ...creativeOf(d) },
    })
    const ad = await graph<{ id: string }>(`${acc.externalId}/ads`, {
      token,
      method: 'POST',
      params: { name, adset_id: adSet.id, creative: JSON.stringify({ creative_id: creative.id }), status },
    })
    // Show it on the dashboard at once; the hourly ad sync fills in results.
    const row = await prisma.adCampaign.upsert({
      where: { socialAccountId_externalId: { socialAccountId: acc.id, externalId: campaignId } },
      create: { workspaceId, socialAccountId: acc.id, externalId: campaignId, name, objective: goal.objective, status, dailyBudget: s.dailyBudget, currency, startsAt: start, endsAt: end },
      update: { status },
    })
    await prisma.boost.update({
      where: { id: boost.id },
      data: { status, campaignExternalId: campaignId, adSetExternalId: adSet.id, adExternalId: ad.id, adCampaignId: row.id },
    })
    return { ok: true, boostId: boost.id }
  } catch (e) {
    const message = explain(e)
    // Don't leave half a campaign behind in the ad account.
    if (campaignId) await graph(campaignId, { token, method: 'DELETE' }).catch(() => {})
    await prisma.boost.update({ where: { id: boost.id }, data: { error: message } })
    return { error: message }
  }
}

// Meta's messages, with the next step for the common ones.
function explain(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  if (e instanceof MetaError) {
    if (e.code === 200 || e.code === 10 || /permission/i.test(msg)) return `Meta refused: ${msg} Reconnect Meta in Channels and allow "Manage ads".`
    if (/payment|funding/i.test(msg)) return `Meta refused: ${msg} Add a payment method in Meta Ads Manager → Billing.`
    if (/page.*(not|isn't).*(linked|connected)|promote.*page/i.test(msg)) return `Meta refused: ${msg} Add the Page to the ad account in Meta Business settings.`
  }
  return `Meta refused: ${msg}`.slice(0, 500)
}

export async function setBoostStatus(workspaceId: string, id: string, status: 'ACTIVE' | 'PAUSED') {
  const b = await prisma.boost.findFirst({ where: { id, workspaceId }, include: { adAccount: true } })
  if (!b || !b.campaignExternalId || b.status === 'FAILED') return { error: 'Boost not found.' }
  if (b.endsAt < new Date()) return { error: 'This boost has ended.' }
  if (!b.adAccount.accessTokenEnc) return { error: 'Reconnect Meta in Channels.' }
  try {
    await graph(b.campaignExternalId, { token: decrypt(b.adAccount.accessTokenEnc), method: 'POST', params: { status } })
  } catch (e) {
    return { error: explain(e) }
  }
  await prisma.boost.update({ where: { id }, data: { status } })
  if (b.adCampaignId) await prisma.adCampaign.update({ where: { id: b.adCampaignId }, data: { status } })
  return { ok: true }
}

export type BoostView = {
  id: string
  goal: string
  status: string
  ended: boolean
  error: string | null
  dailyBudget: number
  currency: string | null
  startsAt: string
  endsAt: string
  audience: { countries: string[]; ageMin: number; ageMax: number; gender: string; category: string }
  results: { spend: number; reach: number; impressions: number; clicks: number; results: number; label: string } | null
}

export async function boostsFor(deliveryIds: string[]): Promise<Record<string, BoostView[]>> {
  if (deliveryIds.length === 0) return {}
  const rows = await prisma.boost.findMany({
    where: { deliveryId: { in: deliveryIds } },
    include: { adCampaign: { include: { days: true } } },
    orderBy: { createdAt: 'desc' },
  })
  const out: Record<string, BoostView[]> = {}
  const now = new Date()
  for (const b of rows) {
    const days = b.adCampaign?.days ?? []
    const sum = (k: 'spend' | 'reach' | 'impressions' | 'clicks' | 'results') => days.reduce((s, x) => s + x[k], 0)
    const type = days.find((x) => x.resultType)?.resultType
    ;(out[b.deliveryId] ??= []).push({
      id: b.id,
      goal: b.goal,
      status: b.status,
      ended: b.endsAt < now,
      error: b.error,
      dailyBudget: b.dailyBudget,
      currency: b.currency,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      audience: b.audience as BoostView['audience'],
      results: b.adCampaign
        ? { spend: sum('spend'), reach: sum('reach'), impressions: sum('impressions'), clicks: sum('clicks'), results: sum('results'), label: type ? resultLabel(type) : (BOOST_GOALS[b.goal as keyof typeof BOOST_GOALS]?.result ?? 'Results') }
        : null,
    })
  }
  return out
}
