import 'server-only'
import type { Prisma } from '@prisma/client'
import { aiEnabled, composeInterview, type CompanyProfile } from './ai'
import { dashboard } from './analytics'
import { benchmarks } from './forecast'
import { prisma } from './prisma'
import {
  CORE_SLOTS,
  NUMERIC,
  SLOTS,
  economics,
  isSlot,
  money,
  type Answer,
  type InterviewData,
  type Known,
  type Option,
  type Question,
  type SlotKey,
} from './interview'

// Business facts and the strategy interview. Facts are what the owner told
// us about the business (one row per slot); the interview asks only what we
// do not know yet, in the business's own words.

// An answer stays fresh this long; older ones are asked again.
const FRESH_DAYS = 120
const MAX_QUESTIONS = 10
const ORDER = { know: 0, economics: 1, sales: 2 } as const
// Free-text corrections to "what we know".
const CORRECTION = 'correction'

type FactValue = { value: Answer['value']; label: string }

export async function businessFacts(workspaceId: string) {
  const rows = await prisma.businessFact.findMany({ where: { workspaceId } })
  const answers: Partial<Record<SlotKey, Answer & { updatedAt: Date }>> = {}
  let correction = ''
  for (const r of rows) {
    const v = r.value as FactValue
    if (r.key === CORRECTION) correction = String(v.value ?? '')
    else if (isSlot(r.key)) answers[r.key] = { value: v.value, label: v.label, source: r.source === 'ESTIMATE' ? 'ESTIMATE' : 'OWNER', updatedAt: r.updatedAt }
  }
  return { answers, correction }
}

export async function saveFact(workspaceId: string, key: SlotKey | typeof CORRECTION, answer: Pick<Answer, 'value' | 'label' | 'source'>) {
  const value = { value: answer.value, label: answer.label } as Prisma.InputJsonValue
  await prisma.businessFact.upsert({
    where: { workspaceId_key: { workspaceId, key } },
    create: { workspaceId, key, value, source: answer.source },
    update: { value, source: answer.source },
  })
}

export async function saveCorrection(workspaceId: string, text: string) {
  if (text.trim()) await saveFact(workspaceId, CORRECTION, { value: text.trim(), label: text.trim(), source: 'OWNER' })
}

// The ad account's currency, else the account's.
async function currencyOf(workspaceId: string) {
  const [campaign, ws] = await Promise.all([
    prisma.adCampaign.findFirst({ where: { workspaceId, currency: { not: null } }, select: { currency: true } }),
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { account: { select: { currency: true } } } }),
  ])
  return campaign?.currency ?? ws.account?.currency ?? 'GEL'
}

// A short line for every AI prompt (dossierBrief): the owner's numbers and
// what they mean for advertising.
export async function businessBrief(workspaceId: string) {
  const { answers, correction } = await businessFacts(workspaceId)
  const keys = (Object.keys(answers) as SlotKey[]).filter((k) => answers[k]!.source !== 'SKIPPED')
  if (!keys.length && !correction) return ''
  const currency = await currencyOf(workspaceId)
  const parts = keys.map((k) => `${SLOTS[k].label}: ${answers[k]!.label}${answers[k]!.source === 'ESTIMATE' ? ' (typical, not confirmed)' : ''}`)
  const e = economics({ answers, costs: { perLead: null, perSale: null, source: null }, estimateLeadToSale: null })
  if (e.valuePerCustomer !== null) parts.push(`one customer brings about ${money(e.valuePerCustomer, currency)} profit — the most a new customer may cost`)
  if (e.maxCostPerLead !== null) parts.push(`an enquiry may cost up to ${money(e.maxCostPerLead, currency)}`)
  if (correction) parts.push(`owner's correction to the website facts: ${correction}`)
  return `Business (from the owner): ${parts.join('; ')}`
}

// Numbers the strategist must respect.
export async function businessEconomics(workspaceId: string) {
  const { answers } = await businessFacts(workspaceId)
  const e = economics({ answers, costs: { perLead: null, perSale: null, source: null }, estimateLeadToSale: null })
  if (e.valuePerCustomer === null && e.capacity === null) return null
  const r = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100)
  return {
    maxCostPerCustomer: r(e.valuePerCustomer),
    maxCostPerLead: r(e.maxCostPerLead),
    newCustomersPerMonthCapacity: e.capacity !== null && e.capacity < 1000 ? e.capacity : null,
  }
}

/* ─── Composing an interview ───────────────────────────────────────────── */

const clean = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)

function fallbackQuestion(key: SlotKey): Question {
  const s = SLOTS[key]
  return { key, chapter: s.chapter, kind: s.kind, text: s.question, options: 'options' in s ? [...s.options] : [], hint: '', estimate: null }
}

// The AI's questions, checked against the slots: kinds and chapters come from
// the slot, numeric options must be numbers, core slots are never missing.
function checkQuestions(raw: unknown, skip: Set<SlotKey>): Question[] {
  const seen = new Set<SlotKey>()
  const out: Question[] = []
  for (const q of Array.isArray(raw) ? raw : []) {
    const key = String(q?.key ?? '')
    if (!isSlot(key) || seen.has(key) || skip.has(key)) continue
    const s = SLOTS[key]
    const numeric = NUMERIC(key)
    let options: Option[] = (Array.isArray(q?.options) ? q.options : [])
      .slice(0, 5)
      .map((o: { label?: unknown; value?: unknown }) => {
        const label = clean(o?.label, 60)
        const value = numeric ? Number(String(o?.value ?? '').replace(',', '.').replace(/[^\d.]/g, '')) : clean(o?.value, 40) || label
        return { label, value }
      })
      .filter((o: Option) => o.label && (numeric ? Number.isFinite(o.value) && (o.value as number) >= 0 : true))
    if (s.kind === 'text') options = []
    else if (options.length < 2) options = 'options' in s ? [...s.options] : []
    const est = numeric ? Number(String(q?.estimate ?? '').replace(',', '.').replace(/[^\d.]/g, '')) : clean(q?.estimate, 60)
    out.push({
      key,
      chapter: s.chapter,
      kind: s.kind,
      text: clean(q?.text, 200) || s.question,
      options,
      hint: clean(q?.hint, 140),
      estimate: numeric ? (Number.isFinite(est) && (est as number) > 0 ? (est as number) : null) : (est as string) || null,
    })
    seen.add(key)
  }
  for (const key of CORE_SLOTS) if (!seen.has(key) && !skip.has(key)) out.push(fallbackQuestion(key))
  return out.sort((a, b) => ORDER[a.chapter] - ORDER[b.chapter]).slice(0, MAX_QUESTIONS)
}

export async function composeFor(workspaceId: string, language: InterviewData['language']): Promise<InterviewData> {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { brandKit: true } })
  const [profileRow, facts, bench, ownCurrency, d30] = await Promise.all([
    prisma.brandProfile.findUnique({ where: { workspaceId } }),
    businessFacts(workspaceId),
    benchmarks(workspaceId),
    currencyOf(workspaceId),
    dashboard(workspaceId, 30).catch(() => null),
  ])
  const currency = bench?.currency ?? ownCurrency
  const profile = profileRow?.data as CompanyProfile | undefined
  const perLead = bench?.costPerResult.lead ?? null
  const perSale = bench?.costPerResult.omni_purchase ?? null
  const spend = d30?.current.spend ? Math.round(d30.current.spend) : null

  // Fresh owner answers are not asked again; they count for the maths.
  const fresh = Date.now() - FRESH_DAYS * 86_400_000
  const answers: InterviewData['answers'] = {}
  for (const k of Object.keys(facts.answers) as SlotKey[]) {
    const a = facts.answers[k]!
    if (a.source === 'OWNER' && a.updatedAt.getTime() > fresh) answers[k] = { value: a.value, label: a.label, source: 'OWNER' }
  }
  const skip = new Set(Object.keys(answers) as SlotKey[])

  // What we know without asking, for the card the owner confirms.
  const m = (v: number) => money(v, currency)
  const own: Known[] = [
    ...(perLead ? [{ label: 'Ads', text: `${m(perLead)} per enquiry over the last ${bench!.days} days` }] : []),
    ...(spend ? [{ label: 'Ad spend', text: `${m(spend)} in the last 30 days` }] : []),
    ...(Object.keys(answers) as SlotKey[]).map((k) => ({ label: SLOTS[k].label, text: answers[k]!.label })),
  ]
  const fromSite: Known[] = profile
    ? [
        profile.summary && { label: 'Business', text: profile.summary.split(/(?<=\.)\s/)[0] },
        profile.offerings.length && { label: 'Offers', text: profile.offerings.slice(0, 3).map((o) => (o.price ? `${o.name} (${o.price})` : o.name)).join(', ') },
        profile.audiences.length && { label: 'Customers', text: profile.audiences.map((a) => a.name).join(', ') },
        profile.locations.length && { label: 'Where', text: profile.locations.slice(0, 3).join(', ') },
      ].filter((x): x is Known => Boolean(x))
    : ws.brandKit?.description
      ? [{ label: 'Business', text: ws.brandKit.description.slice(0, 160) }]
      : []

  const base: InterviewData = {
    language,
    currency,
    vocabulary: { customer: 'customer', customers: 'customers' },
    known: [...fromSite, ...own].slice(0, 6),
    confirmed: null,
    correction: facts.correction,
    questions: checkQuestions([], skip),
    answers,
    costs: { perLead, perSale, source: perLead || perSale ? 'ads' : null },
    estimateLeadToSale: null,
    adSpendMonthly: spend,
    offerings: (profile?.offerings ?? []).map((o) => o.name).filter(Boolean).slice(0, 8),
    goal: null,
    step: 0,
  }
  if (!aiEnabled()) return base

  try {
    // Imported here: the dossier brief itself reads businessBrief.
    const { withDossier } = await import('./dossier')
    const brand = await withDossier(ws.brandKit, workspaceId)
    const draft = await composeInterview(ws.name, brand, {
      slots: (Object.keys(SLOTS) as SlotKey[]).filter((k) => !skip.has(k)).map((k) => ({ key: k, kind: SLOTS[k].kind, question: SLOTS[k].question, required: CORE_SLOTS.includes(k) })),
      facts: {
        adsLast90Days: bench ? { costPerEnquiry: perLead, costPerPurchase: perSale, days: bench.days } : 'no ad history',
        adSpendLast30Days: spend,
        ownerAnswers: Object.fromEntries((Object.keys(answers) as SlotKey[]).map((k) => [SLOTS[k].label, answers[k]!.label])),
        ownerCorrection: facts.correction || undefined,
      },
      currency,
      language,
    })
    const known = (Array.isArray(draft.known) ? draft.known : [])
      .map((k) => ({ label: clean(k?.label, 30), text: clean(k?.text, 160) }))
      .filter((k) => k.label && k.text)
      .slice(0, 5)
    const cpl = Number(draft.estimates?.costPerLead)
    const l2s = Number(draft.estimates?.leadToSale)
    return {
      ...base,
      vocabulary: {
        customer: clean(draft.vocabulary?.customer, 30).toLowerCase() || 'customer',
        customers: clean(draft.vocabulary?.customers, 30).toLowerCase() || 'customers',
      },
      // The account's own numbers stay; the AI adds what the site says.
      known: [...(known.length ? known : fromSite), ...own].slice(0, 6),
      questions: checkQuestions(draft.questions, skip),
      costs: base.costs.source ? base.costs : { perLead: cpl > 0 ? cpl : null, perSale: null, source: cpl > 0 ? 'estimate' : null },
      estimateLeadToSale: l2s > 0 && l2s <= 100 ? l2s : null,
    }
  } catch (e) {
    console.error('composeInterview failed', e)
    return base
  }
}

// Where the strategy interview stands, for the sidebar and the dashboard:
// not taken yet, half answered (resume it), or done.
export type PilotState = { state: 'start' | 'continue' | 'done'; href: string; progress: number }

export async function interviewState(workspaceId: string): Promise<PilotState> {
  const [open, done] = await Promise.all([
    prisma.strategyInterview.findFirst({
      where: { workspaceId, status: 'OPEN', createdAt: { gt: new Date(Date.now() - 14 * 86_400_000) } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, data: true },
    }),
    prisma.strategyInterview.count({ where: { workspaceId, status: 'DONE' } }),
  ])
  const d = open?.data as InterviewData | undefined
  if (open && d && d.step > 0) {
    const answered = d.questions.filter((q) => d.answers[q.key]).length + 1
    return { state: 'continue', href: `/app/strategy/interview/${open.id}`, progress: Math.min(0.95, answered / (d.questions.length + 2)) }
  }
  return { state: done ? 'done' : 'start', href: '/app/strategy/interview', progress: 0 }
}
