import 'server-only'
import { askAiSearch, aiSearchQuestions, type AiAnswer, type PostOptions } from './ai'
import type { Brand } from './ai'
import { prisma } from './prisma'
import { safeFetchText } from './safe-fetch'
import { auditPage, robotsBlocks, type SeoReport } from './seo'
import type { Check } from './tracking'

// AI search (GEO): would ChatGPT, Gemini or Google AI Mode recommend the
// company? Two parts:
//  - readiness (free): AI crawlers allowed in robots.txt, text in the HTML,
//    structured data, business facts, llms.txt;
//  - visibility (AI, paid): customer questions answered with Google Search,
//    whether the company is named or its site cited, who is named instead,
//    and which websites the answers rely on.

export type GeoAnswer = AiAnswer & { question: string; mentioned: boolean; cited: boolean; rivals: string[] }
export type GeoVisibility = { at: string; language: string; questions: GeoAnswer[]; score: number; sources: { domain: string; count: number }[]; rivals: { name: string; count: number }[] }
export type GeoReport = { url: string | null; readiness: { at: string; score: number; checks: Check[] }; visibility?: GeoVisibility }

// Crawlers that read sites to answer questions (blocking them hides you),
// and those that only collect training data.
const ANSWER_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Claude-SearchBot', 'Googlebot', 'Bingbot']
const TRAINING_BOTS = ['GPTBot', 'Google-Extended', 'ClaudeBot', 'CCBot', 'Applebot-Extended']

const siteUrl = (w: string | null | undefined) => (w ? (/^https?:\/\//.test(w) ? w : `https://${w}`) : null)
const domainOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return u.toLowerCase()
  }
}

async function fetchText(url: string) {
  try {
    return (await safeFetchText(url, { timeoutMs: 8000, maxBytes: 500_000, accept: 'text/plain,*/*' })).text
  } catch {
    return null
  }
}

export async function geoReadiness(url: string | null): Promise<GeoReport['readiness']> {
  const at = new Date().toISOString()
  if (!url) return { at, score: 0, checks: [{ key: 'site', label: 'Website', status: 'bad', detail: 'No website in the Brand kit.', fix: 'Add the website address in Brand → Brand kit.' }] }
  const { page, html } = await auditPage(url)
  if (!page.ok) return { at, score: 0, checks: [{ key: 'site', label: 'Website', status: 'bad', detail: `Could not open ${url}: ${page.error}` }] }
  const origin = new URL(page.url).origin
  const [robots, llms] = await Promise.all([fetchText(`${origin}/robots.txt`), fetchText(`${origin}/llms.txt`)])
  const checks: Check[] = []
  let score = 100
  const add = (c: Check, cost: number) => {
    checks.push(c)
    if (c.status === 'bad') score -= cost
    else if (c.status === 'warn') score -= Math.ceil(cost / 2)
  }

  const blocked = robots ? ANSWER_BOTS.filter((b) => robotsBlocks(robots, b)) : []
  add(
    blocked.length
      ? { key: 'answer-bots', label: 'AI assistants may read the site', status: 'bad', detail: `robots.txt blocks ${blocked.join(', ')} — answers can’t use or cite your pages.`, fix: `Remove "Disallow: /" for ${blocked.join(', ')} in robots.txt.` }
      : { key: 'answer-bots', label: 'AI assistants may read the site', status: 'ok', detail: 'ChatGPT search, Perplexity, Claude, Google and Bing crawlers are allowed.' },
    30,
  )
  const training = robots ? TRAINING_BOTS.filter((b) => robotsBlocks(robots, b)) : []
  if (training.length) checks.push({ key: 'training-bots', label: 'AI training crawlers', status: 'info', detail: `Blocked: ${training.join(', ')}. That keeps your content out of model training; it doesn’t stop answers with search — your choice.` })

  add(
    page.words < 150
      ? { key: 'text', label: 'Text in the page code', status: 'bad', detail: `Only ${page.words} words without running JavaScript. Most AI crawlers don’t run JavaScript, so they see an almost empty page.`, fix: 'Render the main content on the server (or pre-render pages) so the text is in the HTML.' }
      : { key: 'text', label: 'Text in the page code', status: 'ok', detail: `${page.words} words readable without JavaScript.` },
    20,
  )
  const org = page.schema.some((t) => /Organization|LocalBusiness|Store|Restaurant|Bakery|RealEstate|Hotel|Dentist|Clinic|Service|Corporation|Brand/i.test(t))
  add(
    org
      ? { key: 'entity', label: 'Who you are, in structured data', status: 'ok', detail: `Found: ${page.schema.join(', ')}.` }
      : { key: 'entity', label: 'Who you are, in structured data', status: 'warn', detail: 'No Organization / LocalBusiness data: assistants must guess your name, address, hours and what you sell.', fix: 'Add JSON-LD Organization or LocalBusiness with name, logo, address, phone, opening hours, sameAs (your Facebook/Instagram), and Product/Offer for prices.' },
    15,
  )
  const faq = page.schema.includes('FAQPage') || /<h[1-4][^>]*>[^<]*(FAQ|questions|вопрос|კითხვ)/i.test(html)
  add(
    faq
      ? { key: 'faq', label: 'Answers to common questions', status: 'ok', detail: 'The site has a questions-and-answers section.' }
      : { key: 'faq', label: 'Answers to common questions', status: 'warn', detail: 'No FAQ found. Assistants quote pages that answer a question directly.', fix: 'Add an FAQ with the questions customers ask (prices, delivery, area, how to order), one short answer each, marked up as FAQPage.' },
    10,
  )
  const facts = /href\s*=\s*["']tel:/i.test(html) || /"telephone"|"address"/i.test(html)
  add(
    facts
      ? { key: 'facts', label: 'Contact details on the page', status: 'ok', detail: 'Phone or address is in the page.' }
      : { key: 'facts', label: 'Contact details on the page', status: 'warn', detail: 'No phone number or address found on the home page.', fix: 'Show the phone (as a tel: link), address and area served on every page — the same as on Google Maps and Facebook.' },
    10,
  )
  add(
    llms && llms.trim().startsWith('#')
      ? { key: 'llms', label: 'llms.txt', status: 'ok', detail: 'The site has an llms.txt summary for AI tools.' }
      : { key: 'llms', label: 'llms.txt', status: 'info', detail: 'No /llms.txt. It is a new, optional summary of the site for AI tools — nice to have, not a ranking factor yet.', fix: 'Add /llms.txt: "# Company name", one paragraph on what you do, then links to the key pages.' },
    0,
  )
  return { at, score: Math.max(0, score), checks }
}

// Does the text name the company (its name or domain)?
function names(text: string, brand: string, domain: string | null) {
  const t = text.toLowerCase()
  const n = brand.toLowerCase().trim()
  return (n.length >= 3 && t.includes(n)) || (!!domain && t.includes(domain))
}

export async function geoVisibility(workspaceId: string, brandName: string, brand: Brand | null, url: string | null, language: PostOptions['language']): Promise<GeoVisibility> {
  const seo = await prisma.websiteAudit.findFirst({ where: { workspaceId, kind: 'SEO' }, orderBy: { createdAt: 'desc' } })
  const seeds = ((seo?.result as SeoReport | undefined)?.search?.queries ?? []).filter((q) => !names(q.key, brandName, null)).map((q) => q.key)
  const questions = await aiSearchQuestions(brandName, brand, seeds, language)
  if (!questions.length) throw new Error('No questions were written')
  const rivals = await prisma.competitor.findMany({ where: { workspaceId }, select: { name: true, website: true } })
  const domain = url ? domainOf(url) : null

  const answers: GeoAnswer[] = []
  // Three at a time.
  for (let i = 0; i < questions.length; i += 3) {
    const batch = await Promise.all(
      questions.slice(i, i + 3).map(async (question) => {
        try {
          const a = await askAiSearch(question)
          const all = `${a.answer}\n${a.businesses.join('\n')}`
          return {
            question,
            ...a,
            mentioned: names(all, brandName, domain),
            cited: !!domain && a.sources.some((s) => s.title.toLowerCase().includes(domain)),
            rivals: rivals.filter((r) => names(all, r.name, r.website ? domainOf(r.website) : null)).map((r) => r.name),
          }
        } catch (e) {
          console.error('askAiSearch failed', e instanceof Error ? e.message : e)
          return null
        }
      }),
    )
    answers.push(...batch.filter((x): x is GeoAnswer => !!x))
  }
  if (!answers.length) throw new Error('The AI could not answer the questions')

  const count = (xs: string[]) => {
    const m = new Map<string, number>()
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }
  // Who gets recommended instead: tracked competitors plus anyone else named.
  const named = answers.flatMap((a) => [...new Set([...a.rivals, ...a.businesses.filter((b) => !names(b, brandName, domain))])])
  return {
    at: new Date().toISOString(),
    language,
    questions: answers,
    score: Math.round((answers.filter((a) => a.mentioned || a.cited).length / answers.length) * 100),
    sources: count(answers.flatMap((a) => [...new Set(a.sources.map((s) => s.title.toLowerCase().replace(/^www\./, '')).filter(Boolean))])).slice(0, 10).map(([domain, count]) => ({ domain, count })),
    rivals: count(named).slice(0, 10).map(([name, count]) => ({ name, count })),
  }
}

export async function saveGeo(workspaceId: string, url: string | null, report: Omit<GeoReport, 'url'>) {
  return prisma.websiteAudit.create({ data: { workspaceId, kind: 'GEO', url, result: { url, ...report } } })
}

export const brandSite = async (workspaceId: string) => siteUrl((await prisma.brandKit.findUnique({ where: { workspaceId }, select: { website: true } }))?.website)
