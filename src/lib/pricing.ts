// What each AI action costs the customer (credits per unit) and what it
// costs Loudpilot (provider cost per unit, USD). Defaults below; super
// admins change them in Admin → Pricing (stored in Setting "pricing").
// Shared by server and client.
//
// The rule behind the defaults: one credit stands for at most $0.02 of
// provider cost, so credits = ⌈cost ÷ $0.02⌉. The cheapest credit we sell
// (Agency paid yearly, ~$0.066 without VAT, ~$0.064 after card fee and
// tax) then still earns at least twice its cost on any action.

import { PLAN_IDS, PLANS, type PlanId } from './plans'

export const ACTIONS = {
  postText: { label: 'AI post text', unit: 'post', credits: 1, costUsd: 0.002 },
  image: { label: 'AI image', unit: 'image', credits: 4, costUsd: 0.067 },
  campaignPost: { label: 'Campaign post / rewrite', unit: 'post', credits: 1, costUsd: 0.002 },
  blogOutline: { label: 'Blog outline', unit: 'outline', credits: 1, costUsd: 0.003 },
  blogArticle: { label: 'Blog article', unit: 'article', credits: 3, costUsd: 0.012 },
  summary: { label: 'Dashboard summary', unit: 'summary', credits: 1, costUsd: 0.003 },
  strategy: { label: 'Strategy plan', unit: 'plan', credits: 5, costUsd: 0.03 },
  advice: { label: 'Marketing suggestions', unit: 'request', credits: 1, costUsd: 0.006 },
  reply: { label: 'Inbox reply draft', unit: 'reply', credits: 1, costUsd: 0.001 },
  videoScript: { label: 'Video script', unit: 'script', credits: 1, costUsd: 0.004 },
  voice: { label: 'Voice-over', unit: 'video', credits: 1, costUsd: 0.01 },
  music: { label: 'AI music (Lyria 3)', unit: 'track', credits: 2, costUsd: 0.04 },
  subtitles: { label: 'Subtitles from speech', unit: 'scene', credits: 1, costUsd: 0.003 },
  clipQuick: { label: 'AI clip · Quick (Veo 3.1 Lite)', unit: 'second', credits: 3, costUsd: 0.05 },
  clipPro: { label: 'AI clip · Pro (Veo 3.1 Fast)', unit: 'second', credits: 8, costUsd: 0.15 },
  clipCinema: { label: 'AI clip · Cinema (Veo 3.1)', unit: 'second', credits: 20, costUsd: 0.4 },
  competitor: { label: 'Competitor website analysis', unit: 'competitor', credits: 1, costUsd: 0.004 },
  competitorSearch: { label: 'Find competitors (Google Search)', unit: 'search', credits: 2, costUsd: 0.036 },
  compare: { label: 'Competitor comparison', unit: 'report', credits: 3, costUsd: 0.02 },
  brandbookRead: { label: 'Brandbook reading', unit: 'brandbook', credits: 2, costUsd: 0.02 },
  brandbookDesign: { label: 'Brandbook design (3 directions)', unit: 'brandbook', credits: 3, costUsd: 0.02 },
  seoAdvice: { label: 'SEO action plan', unit: 'plan', credits: 2, costUsd: 0.02 },
  aiSearch: { label: 'AI search visibility check', unit: 'check', credits: 10, costUsd: 0.2 },
  styleImage: { label: 'Copy a style from an image', unit: 'image', credits: 1, costUsd: 0.003 },
  styleVideo: { label: 'Copy a style from a video', unit: 'video', credits: 2, costUsd: 0.03 },
  chatConversation: { label: 'Website chat conversation (AI answers)', unit: 'conversation', credits: 1, costUsd: 0.01 },
  chatSetup: { label: 'Website assistant set-up', unit: 'set-up', credits: 2, costUsd: 0.01 },
} as const

export type Action = keyof typeof ACTIONS
export const ACTION_KEYS = Object.keys(ACTIONS) as Action[]

// Every plan has a Veo allowance.
export const VEO_PLANS = PLAN_IDS
export type VeoPlan = PlanId

// A top-up: credits bought on top of the plan (prices without VAT, in dollars
// and a fixed price in lari).
export type CreditPack = { credits: number; priceUsd: number; priceGel: number }

export type Pricing = {
  // What one credit is worth in money — shown as the ₾/$ equivalent of any
  // credit amount (plans have their own effective price per credit).
  creditPriceUsd: number
  actions: Record<Action, { credits: number; costUsd: number }>
  // Seconds of AI clips (Veo) each paid plan may generate per calendar month.
  veoSecondsPerMonth: Record<VeoPlan, number>
  // Plan price a month without VAT (USD, and fixed lari) and monthly credits.
  plans: Record<PlanId, { monthly: number; monthlyGel: number; credits: number }>
  // Credit packs for sale on top of a plan, cheaper per credit when bigger.
  packs: CreditPack[]
}

// Dearer per credit than any plan, so a bigger plan beats topping up.
export const DEFAULT_PACKS: CreditPack[] = [
  { credits: 100, priceUsd: 8, priceGel: 22 },
  { credits: 500, priceUsd: 35, priceGel: 95 },
  { credits: 2000, priceUsd: 120, priceGel: 325 },
]

export const DEFAULT_PRICING: Pricing = {
  creditPriceUsd: 0.08,
  veoSecondsPerMonth: { STARTER: 10, TEAM: 30, AGENCY: 120 },
  plans: Object.fromEntries(PLANS.map((p) => [p.id, { monthly: p.monthly, monthlyGel: p.monthlyGel, credits: p.credits }])) as Pricing['plans'],
  packs: DEFAULT_PACKS,
  actions: Object.fromEntries(ACTION_KEYS.map((k) => [k, { credits: ACTIONS[k].credits, costUsd: ACTIONS[k].costUsd }])) as Pricing['actions'],
}

// Credits per unit, by action — what the app shows and charges.
export type Prices = Record<Action, number>
export const pricesOf = (p: Pricing): Prices => Object.fromEntries(ACTION_KEYS.map((k) => [k, p.actions[k].credits])) as Prices

export const DEFAULT_PRICES = pricesOf(DEFAULT_PRICING)

export const clipAction = (quality: 'quick' | 'pro' | 'cinema'): Action => (quality === 'pro' ? 'clipPro' : quality === 'cinema' ? 'clipCinema' : 'clipQuick')

export const creditsLabel = (n: number) => `${n} credit${n === 1 ? '' : 's'}`

// What a customer pays in: Monrem's terminal currency.
export type Currency = 'USD' | 'GEL'
// "$29" or "₾79" — the dollar or the fixed lari price of the same thing
// (cents shown only when there are any: "₾93.22").
const money = (n: number) => n.toLocaleString('en-US', Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const priceLabel = (o: { usd: number; gel: number }, c: Currency) => (c === 'GEL' ? `₾${money(o.gel)}` : `$${money(o.usd)}`)
