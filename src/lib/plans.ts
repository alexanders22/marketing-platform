// Plan limits used by the plan picker, credits page
// and (later) billing.
export type PlanId = 'SOLO' | 'STARTER' | 'TEAM' | 'AGENCY'

export const PLANS: {
  id: PlanId
  name: string
  blurb: string
  // Price a month incl. VAT: in dollars, and a fixed price in lari (not a
  // conversion — charged as is when the terminal takes lari).
  monthly: number
  monthlyGel: number
  users: number
  profiles: number
  // Companies (brands) one account can run, each with its own channels.
  companies: number
  credits: number
  popular?: boolean
}[] = [
  {
    id: 'SOLO',
    name: 'Solo',
    blurb: 'For a small shop or a freelancer posting for one brand.',
    monthly: 15,
    monthlyGel: 39,
    users: 1,
    profiles: 3,
    companies: 1,
    credits: 150,
  },
  {
    id: 'STARTER',
    name: 'Starter',
    blurb: 'For founders and small brands running their own marketing.',
    monthly: 29,
    monthlyGel: 79,
    users: 1,
    profiles: 5,
    companies: 2,
    credits: 400,
  },
  {
    id: 'TEAM',
    name: 'Team',
    blurb: 'For marketing teams handling a few brands and ad accounts.',
    monthly: 79,
    monthlyGel: 219,
    users: 5,
    profiles: 20,
    companies: 10,
    credits: 1200,
    popular: true,
  },
  {
    id: 'AGENCY',
    name: 'Agency',
    blurb: 'For agencies and partners serving many clients at once.',
    monthly: 199,
    monthlyGel: 549,
    users: 20,
    profiles: 100,
    companies: 50,
    credits: 3300,
  },
]

export const PLAN_IDS = PLANS.map((p) => p.id)

// What a plan's monthly credits buy, in things people count — shown instead
// of credits. Each bundle fits in the plan's credits at the default prices
// (checked in tests); credits stay the mechanism, so the mix is flexible.
export type Bundle = { posts: number; images: number; videos: number; articles: number; strategies: number }
export const BUNDLES: Record<PlanId, Bundle> = {
  SOLO: { posts: 30, images: 20, videos: 5, articles: 2, strategies: 1 },
  STARTER: { posts: 60, images: 50, videos: 10, articles: 4, strategies: 2 },
  TEAM: { posts: 180, images: 150, videos: 40, articles: 15, strategies: 6 },
  AGENCY: { posts: 600, images: 400, videos: 100, articles: 40, strategies: 20 },
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

// What an account may have: the plan's numbers, or a single seat before a
// plan is picked.
export type Limits = { companies: number; users: number; profiles: number; api: boolean }
export function planLimits(plan: string): Limits {
  const p = PLANS.find((x) => x.id === plan)
  return p ? { companies: p.companies, users: p.users, profiles: p.profiles, api: p.id === 'AGENCY' } : { companies: 1, users: 1, profiles: 2, api: false }
}
export const companyLimit = (plan: string) => planLimits(plan).companies

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

export const PAID_ONLY = 'AI video clips are part of paid plans. Your trial includes everything else — choose a plan to unlock them.'
