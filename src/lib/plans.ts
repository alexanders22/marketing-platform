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
    credits: 300,
  },
  {
    id: 'TEAM',
    name: 'Team',
    blurb: 'For marketing teams handling a few brands and ad accounts.',
    monthly: 79,
    users: 5,
    profiles: 20,
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
    credits: 5000,
  },
]

export const TRIAL_DAYS = 7
// Credits granted once when a trial starts, whatever plan is picked.
export const TRIAL_CREDITS = 50

export const yearlyTotal = (monthly: number) => monthly * 10
