// What each AI action costs the customer (credits per unit) and what it
// costs Loudpilot (provider cost per unit, USD). Defaults below; super
// admins change them in Admin → Pricing (stored in Setting "pricing").
// Shared by server and client.

export const ACTIONS = {
  postText: { label: 'AI post text', unit: 'post', credits: 1, costUsd: 0.002 },
  image: { label: 'AI image', unit: 'image', credits: 1, costUsd: 0.039 },
  campaignPost: { label: 'Campaign post / rewrite', unit: 'post', credits: 1, costUsd: 0.002 },
  blogOutline: { label: 'Blog outline', unit: 'outline', credits: 1, costUsd: 0.003 },
  blogArticle: { label: 'Blog article', unit: 'article', credits: 3, costUsd: 0.012 },
  summary: { label: 'Dashboard summary', unit: 'summary', credits: 1, costUsd: 0.003 },
  strategy: { label: 'Strategy plan', unit: 'plan', credits: 5, costUsd: 0.03 },
  advice: { label: 'Marketing suggestions', unit: 'request', credits: 1, costUsd: 0.006 },
  reply: { label: 'Inbox reply draft', unit: 'reply', credits: 1, costUsd: 0.001 },
  videoScript: { label: 'Video script', unit: 'script', credits: 1, costUsd: 0.004 },
  voice: { label: 'Voice-over', unit: 'video', credits: 1, costUsd: 0.01 },
  clipQuick: { label: 'AI clip · Quick (Veo 3.1 Lite)', unit: 'second', credits: 1, costUsd: 0.05 },
  clipPro: { label: 'AI clip · Pro (Veo 3.1 Fast)', unit: 'second', credits: 2, costUsd: 0.15 },
  clipCinema: { label: 'AI clip · Cinema (Veo 3.1)', unit: 'second', credits: 5, costUsd: 0.4 },
} as const

export type Action = keyof typeof ACTIONS
export const ACTION_KEYS = Object.keys(ACTIONS) as Action[]

export type Pricing = {
  // What one credit sells for as a top-up (plans have their own effective
  // price per credit, shown next to it).
  creditPriceUsd: number
  actions: Record<Action, { credits: number; costUsd: number }>
}

export const DEFAULT_PRICING: Pricing = {
  creditPriceUsd: 0.1,
  actions: Object.fromEntries(ACTION_KEYS.map((k) => [k, { credits: ACTIONS[k].credits, costUsd: ACTIONS[k].costUsd }])) as Pricing['actions'],
}

// Credits per unit, by action — what the app shows and charges.
export type Prices = Record<Action, number>
export const pricesOf = (p: Pricing): Prices => Object.fromEntries(ACTION_KEYS.map((k) => [k, p.actions[k].credits])) as Prices

export const DEFAULT_PRICES = pricesOf(DEFAULT_PRICING)

export const clipAction = (quality: 'quick' | 'pro' | 'cinema'): Action => (quality === 'pro' ? 'clipPro' : quality === 'cinema' ? 'clipCinema' : 'clipQuick')

export const creditsLabel = (n: number) => `${n} credit${n === 1 ? '' : 's'}`
