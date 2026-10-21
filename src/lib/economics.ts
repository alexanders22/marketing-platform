// Business economics for Admin → Economics (server and client): what each
// plan and credit pack leaves after VAT, payment fees, taxes, partner shares
// and AI costs, against the fixed costs of the month — and how many
// customers it takes not to lose money.

import type { PlanId } from './plans'
import type { CreditPack } from './pricing'
import { netOf } from './tax'

export type FixedCost = { name: string; amount: number; currency: 'GEL' | 'USD' }

export type Economics = {
  // Every month, whatever the sales: own advertising, hosting, salaries…
  fixed: FixedCost[]
  // Card payments: % of the gross price (+ a fixed fee per payment, USD).
  paymentFeePct: number
  paymentFeeUsd: number
  // Tax on turnover after VAT, % (e.g. 1% small business status).
  turnoverTaxPct: number
  // Average share of revenue paid to partners (Upla, Zavnili…), %.
  partnerSharePct: number
  // Customers paying yearly (10 months for 12), %.
  yearlySharePct: number
  // Share of the monthly credits customers really use, % per plan.
  usagePct: Record<PlanId, number>
  // Paying customers per plan to plan for.
  customers: Record<PlanId, number>
  // Credit packs sold per month, by pack size (credits → count).
  packsSold: Record<string, number>
  // New free trials per month (each gets the trial credits).
  trialsPerMonth: number
  // AI cost of one credit in USD; null = from last month's usage.
  costPerCreditUsd: number | null
}

export const DEFAULT_ECONOMICS: Economics = {
  fixed: [
    { name: 'Own advertising', amount: 1000, currency: 'GEL' },
    { name: 'Hosting and services', amount: 60, currency: 'USD' },
    { name: 'Salaries', amount: 0, currency: 'GEL' },
    { name: 'Other', amount: 0, currency: 'GEL' },
  ],
  paymentFeePct: 2.5,
  paymentFeeUsd: 0,
  turnoverTaxPct: 1,
  partnerSharePct: 0,
  yearlySharePct: 20,
  usagePct: { SOLO: 70, STARTER: 60, TEAM: 50, AGENCY: 40 },
  customers: { SOLO: 20, STARTER: 15, TEAM: 5, AGENCY: 1 },
  packsSold: {},
  trialsPerMonth: 50,
  costPerCreditUsd: null,
}

export type PlanEcon = { id: PlanId; name: string; monthly: number; credits: number }

export type Line = {
  key: string
  name: string
  gross: number
  net: number
  fee: number
  tax: number
  partner: number
  ai: number
  contribution: number
  margin: number
}

// One sale (per month): gross price incl. VAT, credits it hands out, share used.
function line(key: string, name: string, gross: number, creditsUsed: number, e: Economics, costPerCredit: number): Line {
  const net = netOf(gross)
  const fee = gross > 0 ? (gross * e.paymentFeePct) / 100 + e.paymentFeeUsd : 0
  const tax = (net * e.turnoverTaxPct) / 100
  const partner = (net * e.partnerSharePct) / 100
  const ai = creditsUsed * costPerCredit
  const contribution = net - fee - tax - partner - ai
  return { key, name, gross, net, fee, tax, partner, ai, contribution, margin: net > 0 ? contribution / net : 0 }
}

export function compute(e: Economics, plans: PlanEcon[], packs: CreditPack[], gelPerUsd: number, mixCost: number | null, trialCredits: number) {
  const costPerCredit = e.costPerCreditUsd ?? mixCost ?? 0.01
  const y = Math.min(100, Math.max(0, e.yearlySharePct)) / 100
  // Per customer per month: a yearly payment is 10 months' price over 12.
  const planLines = plans.map((p) => line(p.id, p.name, p.monthly * (1 - y) + ((p.monthly * 10) / 12) * y, (p.credits * (e.usagePct[p.id] ?? 50)) / 100, e, costPerCredit))
  const packLines = packs.map((pk) => line(`pack:${pk.credits}`, `${pk.credits.toLocaleString('en-US')} credits`, pk.priceUsd, pk.credits, e, costPerCredit))

  const count = (l: Line) => (l.key.startsWith('pack:') ? (e.packsSold[l.key.slice(5)] ?? 0) : (e.customers[l.key as PlanId] ?? 0))
  const all = [...planLines, ...packLines]
  const sum = (f: (l: Line) => number) => all.reduce((s, l) => s + f(l) * count(l), 0)
  const trials = e.trialsPerMonth * trialCredits * costPerCredit
  const fixed = e.fixed.reduce((s, f) => s + (f.currency === 'GEL' ? f.amount / gelPerUsd : f.amount), 0) + trials
  const contribution = sum((l) => l.contribution)
  const profit = contribution - fixed

  // Customers needed with the planned mix of plans (packs scale with them).
  const customers = planLines.reduce((s, l) => s + count(l), 0)
  const perCustomer = customers > 0 ? contribution / customers : 0
  const breakEvenMix = perCustomer > 0 ? Math.ceil(fixed / perCustomer) : null
  const breakEvenPlan = Object.fromEntries(planLines.map((l) => [l.key, l.contribution > 0 ? Math.ceil(fixed / l.contribution) : null])) as Record<PlanId, number | null>

  return {
    costPerCredit,
    planLines,
    packLines,
    count,
    trials,
    fixed,
    revenue: sum((l) => l.gross),
    net: sum((l) => l.net),
    contribution,
    profit,
    customers,
    breakEvenMix,
    breakEvenPlan,
  }
}
