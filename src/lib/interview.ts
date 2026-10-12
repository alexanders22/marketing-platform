// The strategy interview (client and server): the business "slots" every
// company fills in its own words, the maths behind the insights, and the
// reality check of the goal against budget, costs and capacity.

export const CHAPTERS = [
  { id: 'know', label: 'What we know' },
  { id: 'economics', label: 'Economics' },
  { id: 'sales', label: 'Customers and sales' },
  { id: 'goals', label: 'Goals and plan' },
] as const
export type Chapter = (typeof CHAPTERS)[number]['id']

export type Kind = 'choice' | 'multi' | 'number' | 'money' | 'percent' | 'text'
export type Option = { label: string; value: number | string }

type Slot = {
  chapter: Exclude<Chapter, 'goals'>
  kind: Kind
  // Short name for the facts list ("Average sale").
  label: string
  // Wording when the AI does not phrase it for the business.
  question: string
  options?: Option[]
  core?: boolean
}

// Money options are in the account currency; percent values are 0–100.
export const SLOTS = {
  customer_type: {
    chapter: 'know',
    kind: 'choice',
    label: 'Customers',
    question: 'Who buys from you?',
    options: [
      { label: 'People (B2C)', value: 'B2C' },
      { label: 'Businesses (B2B)', value: 'B2B' },
      { label: 'Both', value: 'BOTH' },
    ],
  },
  avg_sale: {
    chapter: 'economics',
    kind: 'money',
    label: 'Average sale',
    question: 'What does one customer usually spend per order or visit?',
    options: [
      { label: 'Under 30', value: 20 },
      { label: '30–100', value: 60 },
      { label: '100–300', value: 180 },
      { label: '300+', value: 500 },
    ],
    core: true,
  },
  margin: {
    chapter: 'economics',
    kind: 'percent',
    label: 'Margin',
    question: 'Roughly what share of a sale is profit, after costs?',
    options: [
      { label: 'Under 15%', value: 10 },
      { label: '15–25%', value: 20 },
      { label: '25–40%', value: 32 },
      { label: 'Over 40%', value: 50 },
    ],
    core: true,
  },
  purchases: {
    chapter: 'economics',
    kind: 'number',
    label: 'Purchases a year per customer',
    question: 'How many times does a customer buy from you in a year?',
    options: [
      { label: 'Once', value: 1 },
      { label: '2–4 times', value: 3 },
      { label: '5–10 times', value: 7 },
      { label: 'More than 10', value: 15 },
    ],
    core: true,
  },
  seasonality: {
    chapter: 'economics',
    kind: 'choice',
    label: 'Seasonality',
    question: 'Does demand change during the year?',
    options: [
      { label: 'Steady all year', value: 'steady' },
      { label: 'Peaks before holidays', value: 'holidays' },
      { label: 'Summer is busiest', value: 'summer' },
      { label: 'Winter is busiest', value: 'winter' },
    ],
  },
  lead_to_sale: {
    chapter: 'sales',
    kind: 'percent',
    label: 'Enquiries that buy',
    question: 'Out of 10 people who ask or apply, how many end up buying?',
    options: [
      { label: '1 or fewer', value: 10 },
      { label: '2–3', value: 25 },
      { label: '4–6', value: 50 },
      { label: '7 or more', value: 75 },
    ],
    core: true,
  },
  sale_channel: {
    chapter: 'sales',
    kind: 'multi',
    label: 'Where sales close',
    question: 'Where do sales usually happen?',
    options: [
      { label: 'Website', value: 'website' },
      { label: 'Phone', value: 'phone' },
      { label: 'Messenger or DM', value: 'messages' },
      { label: 'In person', value: 'in_person' },
      { label: 'Marketplace', value: 'marketplace' },
    ],
  },
  response_time: {
    chapter: 'sales',
    kind: 'choice',
    label: 'Reply time',
    question: 'How fast do you usually answer a new enquiry?',
    options: [
      { label: 'Within 15 minutes', value: '15m' },
      { label: 'Within an hour', value: '1h' },
      { label: 'Same day', value: 'day' },
      { label: 'Next day or later', value: 'later' },
    ],
  },
  capacity: {
    chapter: 'sales',
    kind: 'number',
    label: 'Room for new customers a month',
    question: 'How many new customers a month could you take on without hiring?',
    options: [
      { label: 'Up to 5', value: 5 },
      { label: '5–20', value: 15 },
      { label: '20–50', value: 40 },
      { label: 'No real limit', value: 100_000 },
    ],
    core: true,
  },
  best_segment: { chapter: 'sales', kind: 'text', label: 'Best customers', question: 'Which customers bring you the most money?' },
  why_us: { chapter: 'sales', kind: 'text', label: 'Why customers choose you', question: 'Why do customers choose you over others?' },
  objections: { chapter: 'sales', kind: 'text', label: 'What makes people hesitate', question: 'What makes people hesitate before buying?' },
  tried: { chapter: 'sales', kind: 'text', label: 'Marketing tried before', question: 'What marketing have you tried, and what worked?' },
  restrictions: { chapter: 'sales', kind: 'text', label: 'Limits for ads', question: 'Anything ads must avoid or can’t promise?' },
} satisfies Record<string, Slot>

export type SlotKey = keyof typeof SLOTS
export const isSlot = (k: string): k is SlotKey => k in SLOTS
export const slot = (k: SlotKey): Slot => SLOTS[k]
export const CORE_SLOTS = (Object.keys(SLOTS) as SlotKey[]).filter((k) => (SLOTS[k] as Slot).core)
export const NUMERIC = (k: SlotKey) => ['money', 'percent', 'number'].includes(SLOTS[k].kind)

export type Question = {
  key: SlotKey
  chapter: Exclude<Chapter, 'goals'>
  kind: Kind
  text: string
  options: Option[]
  // Typical for the industry, shown under the question.
  hint: string
  // Used for "Not sure": a typical value for this kind of business.
  estimate: number | string | null
}

export type Answer = {
  value: number | string | string[] | null
  label: string
  source: 'OWNER' | 'ESTIMATE' | 'SKIPPED'
}

export type Known = { label: string; text: string }

// How this business names its customers and sales ("shop / shops", "parcel").
export type Vocabulary = { customer: string; customers: string }

export const OBJECTIVE_IDS = ['SALES', 'LEADS', 'TRAFFIC', 'AWARENESS', 'ENGAGEMENT'] as const
export type Objective = (typeof OBJECTIVE_IDS)[number]

export type GoalAnswer = {
  objective: Objective
  // New customers (SALES) or enquiries (LEADS) over the period.
  target: number | null
  months: 1 | 2 | 3
  monthlyBudget: number | null
  // Offerings to focus on; empty = everything.
  focus: string[]
  // Keep the owner's target although the check says it is out of reach.
  stretch: boolean
}

export type InterviewData = {
  language: 'English' | 'Georgian' | 'Russian'
  currency: string
  vocabulary: Vocabulary
  // What we already know: shown first, the owner confirms or corrects it.
  known: Known[]
  confirmed: boolean | null
  correction: string
  questions: Question[]
  answers: Partial<Record<SlotKey, Answer>>
  // Costs from the account's own ads, else an industry estimate.
  costs: { perLead: number | null; perSale: number | null; source: 'ads' | 'estimate' | null }
  // Typical share of enquiries that buy, when the owner does not know.
  estimateLeadToSale: number | null
  // Ad spend of the last 30 days, a starting point for the budget.
  adSpendMonthly: number | null
  offerings: string[]
  goal: GoalAnswer | null
  // Steps answered, for resuming: 0 = the "what we know" card.
  step: number
}

/* ─── Maths ────────────────────────────────────────────────────────────── */

const num = (a: Answer | undefined) => (a && typeof a.value === 'number' && Number.isFinite(a.value) ? a.value : null)

export function economics(d: Pick<InterviewData, 'answers' | 'costs' | 'estimateLeadToSale'>) {
  const avg = num(d.answers.avg_sale)
  const margin = num(d.answers.margin)
  const purchases = num(d.answers.purchases) ?? 1
  const leadToSale = num(d.answers.lead_to_sale) ?? d.estimateLeadToSale
  // Profit one customer brings in their first year: the most a new customer
  // may cost.
  const valuePerCustomer = avg !== null && margin !== null ? (avg * margin * purchases) / 100 : null
  const maxCostPerLead = valuePerCustomer !== null && leadToSale ? (valuePerCustomer * leadToSale) / 100 : null
  const costPerCustomer = d.costs.perSale ?? (d.costs.perLead && leadToSale ? d.costs.perLead / (leadToSale / 100) : null)
  const capacity = num(d.answers.capacity)
  return { avg, margin, purchases, leadToSale, valuePerCustomer, maxCostPerLead, costPerCustomer, capacity }
}

export type Insight = { tone: 'good' | 'warn' | 'info'; text: string }

export const money = (v: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: v < 10 ? 1 : 0 }).format(v)
  } catch {
    return `${Math.round(v)} ${currency}`
  }
}

// What the answer to `key` tells the owner, right after they give it.
export function insightAfter(key: SlotKey, d: InterviewData): Insight | null {
  const e = economics(d)
  const m = (v: number) => money(v, d.currency)
  const { customer } = d.vocabulary
  if ((key === 'margin' || key === 'purchases') && e.valuePerCustomer !== null) {
    // Once, on the later of the two answers that exist.
    if (key === 'margin' && d.questions.some((q) => q.key === 'purchases') && !d.answers.purchases) return null
    const base = `One ${customer} brings you about ${m(e.valuePerCustomer)} profit in a year. That is the most a new ${customer} may cost.`
    if (e.costPerCustomer === null) return { tone: 'info', text: base }
    const ok = e.costPerCustomer <= e.valuePerCustomer
    return {
      tone: ok ? 'good' : 'warn',
      text: `${base} Your ads bring one for about ${m(e.costPerCustomer)}${d.costs.source === 'estimate' ? ' (typical for your industry)' : ''} — ${ok ? 'that pays off.' : 'more than they earn. The plan will fix that first.'}`,
    }
  }
  if (key === 'lead_to_sale' && e.maxCostPerLead !== null) {
    const now = d.costs.perLead
    return {
      tone: now !== null && now > e.maxCostPerLead ? 'warn' : 'info',
      text: `So an enquiry may cost up to ${m(e.maxCostPerLead)}${now !== null ? `; right now one costs ${m(now)}${d.costs.source === 'estimate' ? ' (typical)' : ''}` : ''}.`,
    }
  }
  if (key === 'capacity' && e.capacity !== null && e.capacity < 1000) {
    return { tone: 'info', text: `Noted: ads will aim for no more than about ${Math.round(e.capacity)} new ${d.vocabulary.customers} a month.` }
  }
  if (key === 'response_time' && d.answers.response_time?.value === 'later') {
    return { tone: 'warn', text: 'Enquiries answered within an hour buy far more often. The plan will suggest an auto-reply.' }
  }
  return null
}

export type Reality = {
  // Cost of one result (customer or enquiry) used for the check.
  per: number
  source: 'ads' | 'estimate'
  expected: number
  neededMonthly: number
  reachable: boolean
  // The target is above what the owner said they can take on.
  capacityLimit: number | null
}

// Is the goal reachable with this budget? Only for customers and enquiries.
export function realityCheck(d: InterviewData, g: GoalAnswer): Reality | null {
  if (!g.target || !g.monthlyBudget || (g.objective !== 'SALES' && g.objective !== 'LEADS')) return null
  const e = economics(d)
  const per = g.objective === 'SALES' ? e.costPerCustomer : d.costs.perLead
  if (!per || !d.costs.source) return null
  const expected = Math.floor((g.monthlyBudget * g.months) / per)
  const limit = g.objective === 'SALES' && e.capacity !== null && e.capacity < 1000 ? Math.round(e.capacity * g.months) : null
  return {
    per,
    source: d.costs.source,
    expected,
    neededMonthly: Math.ceil((g.target * per) / g.months),
    reachable: expected >= g.target,
    capacityLimit: limit !== null && g.target > limit ? limit : null,
  }
}

// The target the plan aims for: the owner's, or the realistic one.
export function planTarget(d: InterviewData, g: GoalAnswer) {
  const r = realityCheck(d, g)
  if (!g.target) return null
  if (g.stretch || !r) return g.target
  return Math.max(1, Math.min(g.target, r.expected, r.capacityLimit ?? Infinity))
}

const OBJECTIVE_WORDS: Record<Objective, string> = {
  SALES: 'More sales',
  LEADS: 'More enquiries',
  TRAFFIC: 'More website visits',
  AWARENESS: 'More people know us',
  ENGAGEMENT: 'More engagement and followers',
}

// The goal sentence the strategist gets.
export function goalSentence(d: InterviewData, g: GoalAnswer) {
  const target = planTarget(d, g)
  const what = g.objective === 'LEADS' ? 'enquiries' : `new ${d.vocabulary.customers}`
  const parts = [
    target ? `${target} ${what} in ${g.months} month${g.months > 1 ? 's' : ''}` : `${OBJECTIVE_WORDS[g.objective]} in the next ${g.months} month${g.months > 1 ? 's' : ''}`,
    g.focus.length ? `focus on ${g.focus.join(', ')}` : '',
    g.stretch && target ? 'the owner keeps this target although the budget looks short — say what it takes' : '',
  ]
  return `${OBJECTIVE_WORDS[g.objective]}: ${parts.filter(Boolean).join('; ')}.`
}
