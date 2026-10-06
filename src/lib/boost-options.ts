import { z } from 'zod'

// Boost settings shared by the form (client) and the server.

export const BOOST_GOALS = {
  AWARENESS: { label: 'More people see it', hint: 'Shown to as many people as the budget allows.', objective: 'OUTCOME_AWARENESS', optimization: 'REACH', result: 'People reached' },
  ENGAGEMENT: { label: 'More engagement', hint: 'Likes, comments and shares on the post.', objective: 'OUTCOME_ENGAGEMENT', optimization: 'POST_ENGAGEMENT', result: 'Engagements' },
  TRAFFIC: { label: 'More website visits', hint: 'Clicks on the link in the post.', objective: 'OUTCOME_TRAFFIC', optimization: 'LINK_CLICKS', result: 'Link clicks' },
} as const
export type BoostGoal = keyof typeof BOOST_GOALS
export const BOOST_GOAL_IDS = Object.keys(BOOST_GOALS) as BoostGoal[]

// Meta's special ad categories: ads about these have a locked audience
// (all ages 18–65, all genders) by law. Real estate is HOUSING.
export const AD_CATEGORIES = {
  NONE: 'None',
  HOUSING: 'Housing (real estate)',
  EMPLOYMENT: 'Jobs',
  FINANCIAL_PRODUCTS_SERVICES: 'Credit and financial services',
} as const
export type AdCategory = keyof typeof AD_CATEGORIES

export const BOOST_COUNTRIES: [string, string][] = [
  ['GE', 'Georgia'],
  ['AM', 'Armenia'],
  ['AZ', 'Azerbaijan'],
  ['TR', 'Türkiye'],
  ['UA', 'Ukraine'],
  ['KZ', 'Kazakhstan'],
  ['IL', 'Israel'],
  ['AE', 'United Arab Emirates'],
  ['DE', 'Germany'],
  ['GB', 'United Kingdom'],
  ['US', 'United States'],
]

export const BoostInput = z
  .object({
    deliveryId: z.string().min(1),
    adAccountId: z.string().min(1),
    goal: z.enum(BOOST_GOAL_IDS as [BoostGoal, ...BoostGoal[]]),
    dailyBudget: z.number().min(1, 'At least 1 a day').max(100_000),
    days: z.number().int().min(1).max(30),
    // Local day "YYYY-MM-DD"; today or empty starts now.
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1, 'Pick at least one country').max(10),
    ageMin: z.number().int().min(18).max(65),
    ageMax: z.number().int().min(18).max(65),
    gender: z.enum(['ALL', 'MEN', 'WOMEN']),
    placements: z.enum(['AUTO', 'NETWORK_ONLY']),
    category: z.enum(Object.keys(AD_CATEGORIES) as [AdCategory, ...AdCategory[]]),
    paused: z.boolean(),
  })
  .refine((b) => b.ageMin <= b.ageMax, { message: 'Minimum age is above the maximum', path: ['ageMin'] })
export type BoostSettings = z.infer<typeof BoostInput>
