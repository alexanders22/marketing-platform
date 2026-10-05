// Plan limits used by the plan picker, credits page
// and (later) billing.
export type PlanId = 'STARTER' | 'TEAM' | 'AGENCY'

export const PLANS: {
  id: PlanId
  name: string
  blurb: string
  monthly: number
  users: number
  profiles: number
  // Companies (brands) one account can run, each with its own channels.
  companies: number
  credits: number
  popular?: boolean
}[] = [
  {
    id: 'STARTER',
    name: 'Starter',
    blurb: 'For founders and small brands running their own marketing.',
    monthly: 29,
    users: 1,
    profiles: 5,
    companies: 2,
    credits: 300,
  },
  {
    id: 'TEAM',
    name: 'Team',
    blurb: 'For marketing teams handling a few brands and ad accounts.',
    monthly: 79,
    users: 5,
    profiles: 20,
    companies: 10,
    credits: 1500,
    popular: true,
  },
  {
    id: 'AGENCY',
    name: 'Agency',
    blurb: 'For agencies and partners serving many clients at once.',
    monthly: 199,
    users: 20,
    profiles: 100,
    companies: 50,
    credits: 5000,
  },
]

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
