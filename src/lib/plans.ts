// Plan limits used by the plan picker, credits page
// and (later) billing.
// Three plans (Start, Business, Agency). The ids stay STARTER / TEAM / AGENCY
// (database, payments, Monrem plans); SOLO was retired — its accounts moved to
// STARTER. People are not limited: every plan has unlimited users.
import type { SocialNetwork } from '@prisma/client'

export type PlanId = 'STARTER' | 'TEAM' | 'AGENCY'

// Networks whose accounts count as "social profiles" against the plan (ad
// accounts, Analytics and Search Console don't).
export const PROFILE_NETWORKS: SocialNetwork[] = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'TELEGRAM', 'X', 'THREADS', 'PINTEREST']

export const PLANS: {
  id: PlanId
  name: string
  blurb: string
  // Price a month without VAT (18% is added at checkout): in dollars, and a fixed price in lari (not a
  // conversion — charged as is when the terminal takes lari).
  monthly: number
  monthlyGel: number
  // Social profiles each company may connect (Agency: one per network).
  profiles: number
  // Companies (brands) one account can run, each with its own channels.
  companies: number
  credits: number
  popular?: boolean
}[] = [
  {
    id: 'STARTER',
    name: 'Start',
    blurb: 'For a small business doing its own marketing.',
    monthly: 29,
    monthlyGel: 79,
    profiles: 3,
    companies: 1,
    credits: 200,
  },
  {
    id: 'TEAM',
    name: 'Business',
    blurb: 'For a growing business with a few brands or locations.',
    monthly: 75,
    monthlyGel: 199,
    profiles: 5,
    companies: 3,
    credits: 700,
    popular: true,
  },
  {
    id: 'AGENCY',
    name: 'Agency',
    blurb: 'For agencies and partners serving many clients at once.',
    monthly: 199,
    monthlyGel: 529,
    profiles: PROFILE_NETWORKS.length,
    companies: 25,
    credits: 2500,
  },
]

export const PLAN_IDS = PLANS.map((p) => p.id)

// What a plan's monthly credits buy, in things people count — shown instead
// of credits. Each bundle fits in the plan's credits at the default prices
// (checked in tests); credits stay the mechanism, so the mix is flexible.
export type Bundle = { posts: number; images: number; videos: number; articles: number; strategies: number }
export const BUNDLES: Record<PlanId, Bundle> = {
  STARTER: { posts: 40, images: 20, videos: 10, articles: 4, strategies: 1 },
  TEAM: { posts: 120, images: 60, videos: 30, articles: 12, strategies: 4 },
  AGENCY: { posts: 400, images: 250, videos: 80, articles: 40, strategies: 15 },
}

// The plans with the prices and credits super admins set (Admin → Pricing):
// `overrides` comes from Pricing.plans. What the credits buy scales with them.
export type Plan = (typeof PLANS)[number]
export function plansWith(overrides: Partial<Record<PlanId, { monthly: number; monthlyGel?: number; credits: number }>> | undefined): (Plan & { bundle: Bundle })[] {
  return PLANS.map((p) => {
    const o = overrides?.[p.id]
    const monthly = o && Number.isFinite(o.monthly) && o.monthly > 0 ? o.monthly : p.monthly
    const monthlyGel = o && Number.isFinite(o.monthlyGel) && o.monthlyGel! > 0 ? o.monthlyGel! : p.monthlyGel
    const credits = o && Number.isFinite(o.credits) && o.credits > 0 ? Math.round(o.credits) : p.credits
    const k = credits / p.credits
    const b = BUNDLES[p.id]
    const bundle = { posts: Math.floor(b.posts * k), images: Math.floor(b.images * k), videos: Math.floor(b.videos * k), articles: Math.floor(b.articles * k), strategies: Math.floor(b.strategies * k) }
    return { ...p, monthly, monthlyGel, credits, bundle }
  })
}

// What the plan picker shows: prices, credits and clip seconds as set in
// Admin → Pricing.
export type PickerPrices = { plans: { id: PlanId; monthly: number; monthlyGel: number; credits: number; bundle: Bundle; veo: number }[] }

export const TRIAL_DAYS = 7
// Credits granted once when a trial starts, whatever plan is picked.
export const TRIAL_CREDITS = 50

export const yearlyTotal = (monthly: number) => monthly * 10

// What an account may have: the plan's numbers, or the smallest before a plan
// is picked. Users are never limited.
export type Limits = { companies: number; profiles: number; api: boolean }
export function planLimits(plan: string): Limits {
  const p = PLANS.find((x) => x.id === plan)
  return p ? { companies: p.companies, profiles: p.profiles, api: p.id === 'AGENCY' } : { companies: 1, profiles: 2, api: false }
}
export const companyLimit = (plan: string) => planLimits(plan).companies
// Customers who came through a partner (Upla, Zavnili, Dotcom…) pay by
// credits, without a plan: until they pick one they get Business limits.
export const PARTNER_PLAN = 'TEAM'
export const limitsFor = (a: { plan: string; partnerId?: string | null }) => planLimits(a.plan === 'NONE' && a.partnerId ? PARTNER_PLAN : a.plan)

// none: no plan picked · trial: free trial running · active: paid through
// paidUntil · expired: trial over and not paid.
export type BillingState = 'none' | 'trial' | 'active' | 'expired'
type Billable = { plan: string; trialEndsAt: Date | null; paidUntil: Date | null }
export function billingState(a: Billable, now = new Date()): BillingState {
  if (a.plan === 'NONE') return 'none'
  if (a.paidUntil && a.paidUntil > now) return 'active'
  if (a.trialEndsAt && a.trialEndsAt > now) return 'trial'
  return 'expired'
}

// A paying customer. Premium features (AI clips with Veo) need it — the end
// of a trial alone is not a payment.
export const isPaid = (a: Billable, now = new Date()) => billingState(a, now) === 'active'

// The API is part of Agency; any plan may try it during the free trial.
export const apiAllowed = (a: Billable, now = new Date()) => {
  const state = billingState(a, now)
  return state === 'trial' || (state === 'active' && planLimits(a.plan).api)
}

// After a paid period ends everything keeps working for a few days (the
// renewal reminders go out meanwhile); then publishing, connecting channels
// and the free background AI stop until the plan is renewed. Credits stay
// spendable — bought credits never expire. Partner customers pay by credits
// and are always served.
export const GRACE_MS = 3 * 86_400_000
type Served = Billable & { partnerId?: string | null }
export function serviceOn(a: Served | null | undefined, now = new Date()) {
  if (!a || a.partnerId) return true
  if (a.paidUntil && a.paidUntil.getTime() > now.getTime() - GRACE_MS) return true
  return billingState(a, now) === 'trial'
}
export const serviceOff = (a: Served) =>
  a.plan === 'NONE'
    ? 'Choose a plan to start your free trial — then you can publish and connect channels.'
    : 'Your plan has ended. Renew it to publish and connect channels again — your posts, channels and credits are kept.'

export const PAID_ONLY = 'AI video clips are part of paid plans. Your trial includes everything else — choose a plan to unlock them.'
