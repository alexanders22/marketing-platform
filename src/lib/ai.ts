import 'server-only'
import { GoogleGenAI, type Part } from '@google/genai'
import type { BrandKit } from '@prisma/client'
import { noteAiFailure } from './ai-health'
import { COPY_RULES, MARKETING_PLAYBOOK } from './marketing-kb'

// GEMINI_API_KEY enables generation. GEMINI_MODEL / GEMINI_IMAGE_MODEL
// override the defaults.
const key = process.env.GEMINI_API_KEY
const client = key ? new GoogleGenAI({ apiKey: key }) : null
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'
// Used when the main model stays overloaded (503) after retries.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest'
// Tried in order; the first that answers wins.
const IMAGE_MODELS = [process.env.GEMINI_IMAGE_MODEL, 'gemini-3.1-flash-image', 'gemini-2.5-flash-image'].filter(
  (m): m is string => Boolean(m),
)

export const aiEnabled = () => client !== null

export const TONES = ['Professional', 'Friendly', 'Educational', 'Bold', 'Founder-led'] as const
export const LENGTHS = ['Short', 'Medium', 'Long'] as const
export const LANGUAGES = ['English', 'Georgian', 'Russian'] as const

export type Attachment = { mime: string; data: string } // base64

export type PostOptions = {
  prompt: string
  tone: (typeof TONES)[number]
  length: (typeof LENGTHS)[number]
  aiHashtags: boolean
  language: (typeof LANGUAGES)[number]
  attachments: Attachment[]
}

export type GeneratedPost = { caption: string; hashtags: string[] }

const LENGTH = { Short: 'under 200 characters', Medium: '300–600 characters', Long: '800–1300 characters' }
const TONE_HINT: Record<PostOptions['tone'], string> = {
  Professional: 'clear, credible, polished',
  Friendly: 'warm, conversational, approachable',
  Educational: 'teaches something useful; explain simply with a concrete takeaway',
  Bold: 'confident, punchy, short sentences, strong call to action',
  'Founder-led': 'first person from the founder, personal story, honest and human',
}

// BrandKit plus, when known, the dossier brief (company profile and what
// worked before) — see src/lib/dossier.ts.
export type Brand = BrandKit & { dossier?: string }

function brandContext(name: string, brand: Brand | null) {
  return [
    `Brand: ${name}`,
    brand?.website && `Website: ${brand.website}`,
    brand?.description && `About: ${brand.description}`,
    brand?.audience && `Audience: ${brand.audience}`,
    brand?.voice && `Voice: ${brand.voice}`,
    brand?.dossier && `What the agency knows about this company (use it; never repeat what did not work):\n${brand.dossier}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function generatePost(brandName: string, brand: Brand | null, o: PostOptions): Promise<GeneratedPost> {
  if (!client) throw new Error('AI is not configured')
  const system = [
    'You write social media posts for one brand. Stay strictly on brand and never invent prices, dates, offers or facts that are not in the request, the attached images or the brand details.',
    brandContext(brandName, brand),
    COPY_RULES,
    `Tone: ${o.tone} — ${TONE_HINT[o.tone]}. Length: ${LENGTH[o.length]}. Write in ${o.language}.`,
    o.attachments.length ? 'The user attached reference images — describe what is actually in them when relevant.' : '',
    o.aiHashtags ? 'Add 3–6 relevant hashtags in the "hashtags" array (without #).' : 'Return an empty "hashtags" array.',
    'Return JSON: {"caption": string, "hashtags": string[]}. The caption must not contain the hashtags.',
  ]
    .filter(Boolean)
    .join('\n\n')

  const parts: Part[] = [
    ...o.attachments.map((a) => ({ inlineData: { mimeType: a.mime, data: a.data } })),
    { text: o.prompt },
  ]
  const res = await retrying((model) => client.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      maxOutputTokens: 1500,
      abortSignal: AbortSignal.timeout(45_000),
    },
  }))
  const parsed = JSON.parse(res.text ?? '{}') as Partial<GeneratedPost>
  if (!parsed.caption) throw new Error('Empty AI response')
  return {
    caption: String(parsed.caption).trim(),
    // Same rule as saved posts: letters, digits and _ only ("coffee-tips" → "coffeetips").
    hashtags: (parsed.hashtags ?? []).map((h) => String(h).replace(/[^\p{L}\p{N}_]/gu, '')).filter((h) => h.length > 0 && h.length <= 60).slice(0, 8),
  }
}

// One square social image for the post, in the brand's colours.
export async function generateImage(
  brandName: string,
  brand: Brand | null,
  brief: string,
  caption: string,
  variant: number,
  attachments: Attachment[],
  aspect: '1:1' | '9:16' | '4:5' | '16:9' = '1:1',
  // A chosen look (IMAGE_STYLES prompt); default: photo or clean graphic.
  style?: string,
): Promise<{ data: Buffer; mime: string }> {
  if (!client) throw new Error('AI is not configured')
  const prompt = [
    `Create a ${aspect === '1:1' ? 'square (1:1)' : aspect === '16:9' ? 'landscape (16:9)' : `vertical (${aspect})`} social media image for the brand "${brandName}".`,
    brand?.description && `About the brand: ${brand.description}`,
    brand?.colors.length ? `Use the brand colours ${brand.colors.join(', ')} as the dominant palette.` : '',
    `Post brief: ${brief}`,
    `Post caption: ${caption.slice(0, 600)}`,
    attachments.length ? 'Use the attached images as the product/subject reference — keep it recognisable.' : '',
    style ? `Make it ${style}. No words, letters, logos or watermarks in the image.` : 'Photorealistic or clean modern graphic style. No words, letters, logos or watermarks in the image.',
    variant > 0 ? `This is alternative #${variant + 1}: use a clearly different composition.` : '',
  ]
    .filter(Boolean)
    .join('\n')

  let lastError: unknown
  for (const model of IMAGE_MODELS) {
    try {
      const res = await client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [...attachments.map((a) => ({ inlineData: { mimeType: a.mime, data: a.data } })), { text: prompt }],
          },
        ],
        config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect }, abortSignal: AbortSignal.timeout(90_000) },
      })
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
      if (part?.inlineData?.data) {
        return { data: Buffer.from(part.inlineData.data, 'base64'), mime: part.inlineData.mimeType || 'image/png' }
      }
      lastError = new Error(`${model} returned no image`)
    } catch (e) {
      lastError = e
    }
  }
  noteAiFailure(lastError)
  throw lastError ?? new Error('Image generation failed')
}

// ─── Campaigns & blog ──────────────────────────────────────────────────────

// `schema` (JSON Schema) makes the model return exactly that shape.
// Gemini sometimes answers 503 "high demand" or 429: wait and try again,
// then once more on the lighter fallback model.
const busy = (e: unknown) => [429, 500, 503].includes((e as { status?: number }).status ?? 0)
async function retrying<T>(fn: (model: string) => Promise<T>, tries = 2): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn(MODEL)
    } catch (e) {
      if (!busy(e)) {
        noteAiFailure(e)
        throw e
      }
      if (i >= tries) break
      await new Promise((r) => setTimeout(r, 2000 * i))
    }
  }
  console.warn(`Gemini ${MODEL} busy — using ${FALLBACK_MODEL}`)
  return fn(FALLBACK_MODEL)
}

async function json<T>(system: string, prompt: string, maxOutputTokens: number, timeoutMs = 60_000, schema?: unknown): Promise<T> {
  if (!client) throw new Error('AI is not configured')
  const res = await retrying((model) => client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      ...(schema ? { responseJsonSchema: schema } : {}),
      maxOutputTokens,
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  }))
  return JSON.parse(res.text ?? 'null') as T
}

export type PlannedPost = { angle: string; caption: string; hashtags: string[] }

// One coherent run of posts: each slot gets a distinct angle that moves the
// campaign forward (tease → launch → proof → reminder → last call …).
export async function generateCampaignPosts(
  brandName: string,
  brand: Brand | null,
  o: { brief: string; dates: string[]; tone: PostOptions['tone']; language: PostOptions['language'] },
): Promise<PlannedPost[]> {
  const system = [
    'You are a social media strategist planning one campaign for a brand. Never invent prices, dates, offers or facts beyond the brief and brand details.',
    brandContext(brandName, brand),
    COPY_RULES,
    `Tone: ${o.tone} — ${TONE_HINT[o.tone]}. Write in ${o.language}. Captions 300–600 characters, no hashtags inside captions.`,
    `Return JSON: an array of exactly ${o.dates.length} objects {"angle": short label, "caption": string, "hashtags": string[3-6 without #]}, in date order. Every post must have a different angle and build on the previous ones.`,
  ].join('\n\n')
  const prompt = `Campaign brief: ${o.brief}\n\nPublishing dates: ${o.dates.join(', ')}`
  const out = await json<PlannedPost[]>(system, prompt, Math.min(16000, 1200 * o.dates.length + 1000), 120_000)
  if (!Array.isArray(out) || out.length === 0) throw new Error('Empty campaign plan')
  return out.slice(0, o.dates.length).map((p) => ({
    angle: String(p.angle ?? '').slice(0, 120),
    caption: String(p.caption ?? '').trim(),
    hashtags: (p.hashtags ?? []).map((h) => String(h).replace(/[^\p{L}\p{N}_]/gu, '')).filter((h) => h.length > 0 && h.length <= 60).slice(0, 8),
  }))
}

export type BlogOutline = { title: string; summary: string; keywords: string[] }

export async function generateBlogOutlines(
  brandName: string,
  brand: Brand | null,
  o: { brief: string; count: number; language: PostOptions['language'] },
): Promise<BlogOutline[]> {
  const system = [
    'You plan a series of blog articles for a brand: useful, search-friendly topics that the brand can credibly write about. Never invent facts about the brand.',
    brandContext(brandName, brand),
    `Write in ${o.language}. Return JSON: an array of exactly ${o.count} objects {"title": string, "summary": 2–3 sentence outline, "keywords": string[3-6]}. Topics must not overlap.`,
  ].join('\n\n')
  const out = await json<BlogOutline[]>(system, `Series goal: ${o.brief}`, 400 * o.count + 400)
  if (!Array.isArray(out) || out.length === 0) throw new Error('Empty blog plan')
  return out.slice(0, o.count).map((b) => ({
    title: String(b.title ?? '').slice(0, 200),
    summary: String(b.summary ?? '').slice(0, 1000),
    keywords: (b.keywords ?? []).map(String).slice(0, 8),
  }))
}

export type BlogArticle = { title: string; body: string }

const BLOG_LENGTH = { Short: '500–700 words', Medium: '900–1200 words', Long: '1500–2000 words' }

export async function generateBlogArticle(
  brandName: string,
  brand: Brand | null,
  o: {
    topic: string
    keywords: string[]
    tone: PostOptions['tone']
    length: PostOptions['length']
    language: PostOptions['language']
  },
): Promise<BlogArticle> {
  const system = [
    'You write blog articles for a brand. Structure with an engaging intro, H2/H3 sections, short paragraphs, lists where useful and a closing call to action. Never invent statistics, prices or facts about the brand; speak generally where unsure.',
    brandContext(brandName, brand),
    COPY_RULES,
    `Tone: ${o.tone} — ${TONE_HINT[o.tone]}. Length: ${BLOG_LENGTH[o.length]}. Write in ${o.language}.`,
    o.keywords.length ? `Work these keywords in naturally: ${o.keywords.join(', ')}.` : '',
    'Return JSON: {"title": string, "body": Markdown string without the title as H1}.',
  ]
    .filter(Boolean)
    .join('\n\n')
  const out = await json<BlogArticle>(system, `Article topic: ${o.topic}`, 8000, 120_000)
  if (!out?.title || !out?.body) throw new Error('Empty article')
  return { title: String(out.title).slice(0, 200), body: String(out.body).trim() }
}

// ─── Analytics ─────────────────────────────────────────────────────────────

export type PerformanceSummary = { headline: string; wins: string[]; concerns: string[]; actions: string[] }

// Reads the dashboard numbers and explains them. Uses only the given facts;
// with no data it says so instead of guessing.
export async function summarizePerformance(
  brandName: string,
  brand: Brand | null,
  facts: unknown,
  language: PostOptions['language'] = 'English',
): Promise<PerformanceSummary> {
  const system = [
    'You are a senior performance marketer reviewing a brand’s results for its owner. Be concrete and brief: name campaigns and numbers, compare with the previous period, and explain likely causes in plain words.',
    'Use ONLY the numbers given for the client. You may compare them with the typical ranges in the playbook, saying they are typical. Never invent the client\'s numbers or campaigns. If paid, organic or website data is empty, say that it is not connected or has no activity instead of analysing it.',
    'Recommendations must be specific actions the owner can take this week (e.g. move budget from A to B, refresh the creative of C, post more of the format that worked).',
    brandContext(brandName, brand),
    MARKETING_PLAYBOOK,
    `Write in ${language}. Money in the given currency. Return JSON {"headline": one sentence, "wins": string[0-3], "concerns": string[0-3], "actions": string[1-4]}.`,
  ].join('\n\n')
  const out = await json<PerformanceSummary>(system, `Results:\n${JSON.stringify(facts)}`, 2000)
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 400)).filter(Boolean).slice(0, n) : [])
  return {
    headline: String(out?.headline ?? '').slice(0, 300),
    wins: list(out?.wins, 3),
    concerns: list(out?.concerns, 3),
    actions: list(out?.actions, 4),
  }
}

// ─── Dossier ───────────────────────────────────────────────────────────────

export type CompanyProfile = {
  summary: string
  industry: string
  offerings: { name: string; description: string; price?: string }[]
  usp: string[]
  audiences: { name: string; description: string }[]
  locations: string[]
  tone: string
  proof: string[]
  keywords: string[]
  gaps: string[]
}

const strList = (v: unknown, n: number, len = 300) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, len)).filter(Boolean).slice(0, n) : [])

// Reads the company's own pages. Only what the pages say — gaps are listed
// instead of filled in.
export async function buildCompanyProfile(name: string, pages: { url: string; text: string }[]): Promise<CompanyProfile> {
  const system = [
    'You are a marketing strategist reading a company website to brief an advertising agency.',
    'Use ONLY what the pages say. Never invent prices, products, numbers, awards or locations. If something important is missing (prices, target customer, proof, contact), list it under "gaps".',
    'Return JSON {"summary": 2-3 sentences, "industry": string, "offerings": [{"name","description","price"?}] up to 12, "usp": string[] up to 6, "audiences": [{"name","description"}] up to 4, "locations": string[], "tone": one sentence on how the brand speaks, "proof": string[] (reviews, numbers, clients, awards stated on the site), "keywords": string[] up to 12, "gaps": string[]}. Write in English.',
  ].join('\n\n')
  const body = pages.map((p) => `### ${p.url}\n${p.text}`).join('\n\n').slice(0, 60_000)
  const out = await json<Partial<CompanyProfile>>(system, `Company: ${name}\n\n${body}`, 4000, 90_000)
  return {
    summary: String(out?.summary ?? '').slice(0, 800),
    industry: String(out?.industry ?? '').slice(0, 120),
    offerings: (Array.isArray(out?.offerings) ? out.offerings : []).slice(0, 12).map((o) => ({
      name: String(o?.name ?? '').slice(0, 120),
      description: String(o?.description ?? '').slice(0, 400),
      ...(o?.price ? { price: String(o.price).slice(0, 60) } : {}),
    })),
    usp: strList(out?.usp, 6),
    audiences: (Array.isArray(out?.audiences) ? out.audiences : []).slice(0, 4).map((a) => ({
      name: String(a?.name ?? '').slice(0, 80),
      description: String(a?.description ?? '').slice(0, 300),
    })),
    locations: strList(out?.locations, 10, 120),
    tone: String(out?.tone ?? '').slice(0, 300),
    proof: strList(out?.proof, 8),
    keywords: strList(out?.keywords, 12, 60),
    gaps: strList(out?.gaps, 8),
  }
}

export type AuditFinding = { insight: string; evidence: string }
export type BrandAuditData = {
  summary: string
  works: AuditFinding[]
  doesnt: AuditFinding[]
  topics: { name: string; verdict: 'works' | 'weak' | 'untested'; evidence: string }[]
  bestTimes: string
  formats: string
  frequency: string
  ads: AuditFinding[]
  avoid: string[]
  opportunities: string[]
}

const findings = (v: unknown, n: number): AuditFinding[] =>
  (Array.isArray(v) ? v : [])
    .slice(0, n)
    .map((f) => ({ insight: String(f?.insight ?? '').slice(0, 400), evidence: String(f?.evidence ?? '').slice(0, 400) }))
    .filter((f) => f.insight)

// The agency's first read of the account: patterns in what was published
// and advertised, backed by the computed numbers.
export async function auditBrand(brandName: string, brand: Brand | null, profile: CompanyProfile | null, stats: unknown): Promise<BrandAuditData> {
  const system = [
    'You are the head of a social media and performance agency auditing a new client’s last 12 months.',
    'Every finding must cite evidence from the numbers or posts given (e.g. "carousels: 2.4× the average engagement over 18 posts"). Do not invent numbers. With fewer than 5 posts or no data in an area, say it is untested instead of concluding.',
    'Group posts into topics by what they are about (product, behind the scenes, offers, tips, news …) and judge each topic.',
    'Write for a busy owner: plain words, specific, no jargon.',
    brandContext(brandName, brand),
    MARKETING_PLAYBOOK,
    profile ? `Company profile: ${JSON.stringify(profile)}` : '',
    'Return JSON {"summary": 2-3 sentences, "works": [{"insight","evidence"}] up to 5, "doesnt": [{"insight","evidence"}] up to 5, "topics": [{"name","verdict": "works"|"weak"|"untested","evidence"}] up to 8, "bestTimes": one sentence, "formats": one sentence, "frequency": one sentence, "ads": [{"insight","evidence"}] up to 4, "avoid": string[] up to 5 concrete things never to repeat, "opportunities": string[] up to 5 things not tried yet that fit this company}.',
  ]
    .filter(Boolean)
    .join('\n\n')
  const out = await json<Partial<BrandAuditData>>(system, `Numbers and posts:\n${JSON.stringify(stats)}`, 5000, 90_000)
  return {
    summary: String(out?.summary ?? '').slice(0, 800),
    works: findings(out?.works, 5),
    doesnt: findings(out?.doesnt, 5),
    topics: (Array.isArray(out?.topics) ? out.topics : []).slice(0, 8).map((t) => ({
      name: String(t?.name ?? '').slice(0, 80),
      verdict: (['works', 'weak', 'untested'].includes(String(t?.verdict)) ? t!.verdict : 'untested') as 'works' | 'weak' | 'untested',
      evidence: String(t?.evidence ?? '').slice(0, 300),
    })),
    bestTimes: String(out?.bestTimes ?? '').slice(0, 300),
    formats: String(out?.formats ?? '').slice(0, 300),
    frequency: String(out?.frequency ?? '').slice(0, 300),
    ads: findings(out?.ads, 4),
    avoid: strList(out?.avoid, 5),
    opportunities: strList(out?.opportunities, 5),
  }
}

// ─── Strategist ────────────────────────────────────────────────────────────

export type StrategyDraft = {
  headline: string
  diagnosis: string[]
  strategy: string
  audiences: { id: string; name: string; who: string; why: string; targeting: { ages: string; genders: string; locations: string[]; interests: string[] }; message: string }[]
  budgetSplit: { label: string; share: number; why: string }[]
  ads: {
    id: string
    name: string
    objective: string
    audienceId: string
    share: number
    days: number
    creatives: { headline: string; primaryText: string; cta: string; visual: string }[]
    why: string
  }[]
  pillars: { name: string; why: string; share: number }[]
  posts: { id: string; date: string; time: string; network: string; format: string; pillar: string; caption: string; hashtags: string[]; visual: string; why: string }[]
  goals: { id: string; scope: 'ADS' | 'POSTS' | 'WEBSITE'; network?: string | null; metric: string; target: number; windowDays: number; why: string }[]
  weekly: string
  risks: string[]
}

export async function generateStrategy(brandName: string, brand: Brand | null, brief: unknown, language: PostOptions['language']): Promise<StrategyDraft> {
  const system = [
    'You are the strategy director of a full-service advertising agency (social media + Meta ads). The client tells you a business goal; you return the plan your agency will run.',
    'Rules:',
    '- Ground every decision in the dossier, the client facts and past results. Quote the evidence briefly in "why". Never invent prices, offers, numbers or results.',
    '- Repeat what worked, avoid what did not (see "Never repeat"). Prefer formats and times that performed best.',
    '- Forecasts are computed by the system, not by you: do not write expected leads, reach or costs.',
    '- Budget: give shares (0–1) of the total; ads[].share is that campaign’s share of the TOTAL budget. Shares across budgetSplit sum to 1.',
    '- Posts: only for the first 14 days of the period, 3–10 posts, each with a ready caption and 3–8 hashtags (no #). Dates YYYY-MM-DD inside the period, time HH:MM.',
    '- Goals use only these metric ids — ads: cost_per_result, results, ctr, cpm, spend; posts: posts, reach, avg_reach, engagements, engagement_rate, views; website (only when the facts include website numbers): site_key_events, site_cost_per_key_event, site_visits, site_conversion_rate. scope "ADS", "POSTS" or "WEBSITE"; percent targets in percent (2 = 2%). Money targets only when the facts give a currency and past cost per result.',
    '- If there is no ad budget, plan organic only and say what an ad budget would add.',
    brandContext(brandName, brand),
    MARKETING_PLAYBOOK,
    `Write in ${language}.`,
    'Return JSON {"headline": one sentence, "diagnosis": string[2-5] what stands between the client and the goal, "strategy": 3-5 sentences, "audiences": [{"id":"a1","name","who","why","targeting":{"ages":"25-44","genders":"all|women|men","locations":string[],"interests":string[]},"message": the angle for them}] 1-3, "budgetSplit": [{"label","share","why"}], "ads": [{"id":"c1","name","objective": "SALES"|"LEADS"|"TRAFFIC"|"AWARENESS"|"ENGAGEMENT","audienceId","share","days","creatives":[{"headline","primaryText","cta","visual"}] 2-3,"why"}] 0-3, "pillars": [{"name","why","share"}] 2-4, "posts": [{"id":"p1","date","time","network": "FACEBOOK"|"INSTAGRAM","format": "Reel"|"Carousel"|"Photo"|"Video"|"Text","pillar","caption","hashtags": string[],"visual": what to shoot or design for it,"why": the evidence for this post}], "goals": [{"id":"g1","scope","network": "FACEBOOK"|"INSTAGRAM"|null,"metric","target","windowDays": 7|30,"why"}] 2-5, "weekly": what the agency checks every week, "risks": string[1-3]}.',
  ].join('\n\n')
  const out = await json<Partial<StrategyDraft>>(system, `Brief and facts:\n${JSON.stringify(brief)}`, 16000, 150_000)
  const arr = <T,>(v: unknown, n: number) => (Array.isArray(v) ? (v as T[]).slice(0, n) : [])
  const str = (v: unknown, n = 500) => String(v ?? '').slice(0, n)
  const num = (v: unknown, lo: number, hi: number, d: number) => {
    const x = Number(v)
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d
  }
  return {
    headline: str(out?.headline, 300),
    diagnosis: arr<unknown>(out?.diagnosis, 5).map((x) => str(x, 400)),
    strategy: str(out?.strategy, 1500),
    audiences: arr<StrategyDraft['audiences'][number]>(out?.audiences, 3).map((a, i) => ({
      id: str(a?.id, 20) || `a${i + 1}`,
      name: str(a?.name, 80),
      who: str(a?.who, 300),
      why: str(a?.why, 300),
      targeting: {
        ages: str(a?.targeting?.ages, 20),
        genders: str(a?.targeting?.genders, 20),
        locations: arr<unknown>(a?.targeting?.locations, 10).map((x) => str(x, 80)),
        interests: arr<unknown>(a?.targeting?.interests, 12).map((x) => str(x, 80)),
      },
      message: str(a?.message, 300),
    })),
    budgetSplit: arr<StrategyDraft['budgetSplit'][number]>(out?.budgetSplit, 5).map((b) => ({ label: str(b?.label, 80), share: num(b?.share, 0, 1, 0), why: str(b?.why, 300) })),
    ads: arr<StrategyDraft['ads'][number]>(out?.ads, 3).map((c, i) => ({
      id: str(c?.id, 20) || `c${i + 1}`,
      name: str(c?.name, 120),
      objective: ['SALES', 'LEADS', 'TRAFFIC', 'AWARENESS', 'ENGAGEMENT'].includes(String(c?.objective)) ? String(c.objective) : 'LEADS',
      audienceId: str(c?.audienceId, 20),
      share: num(c?.share, 0, 1, 0),
      days: Math.round(num(c?.days, 3, 90, 14)),
      creatives: arr<StrategyDraft['ads'][number]['creatives'][number]>(c?.creatives, 3).map((k) => ({
        headline: str(k?.headline, 120),
        primaryText: str(k?.primaryText, 1200),
        cta: str(k?.cta, 40),
        visual: str(k?.visual, 400),
      })),
      why: str(c?.why, 400),
    })),
    pillars: arr<StrategyDraft['pillars'][number]>(out?.pillars, 4).map((p) => ({ name: str(p?.name, 80), why: str(p?.why, 300), share: num(p?.share, 0, 1, 0) })),
    posts: arr<StrategyDraft['posts'][number]>(out?.posts, 10).map((p, i) => ({
      id: str(p?.id, 20) || `p${i + 1}`,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(p?.date)) ? String(p.date) : '',
      time: /^\d{2}:\d{2}$/.test(String(p?.time)) ? String(p.time) : '10:00',
      network: ['FACEBOOK', 'INSTAGRAM'].includes(String(p?.network)) ? String(p.network) : 'INSTAGRAM',
      format: str(p?.format, 30),
      pillar: str(p?.pillar, 80),
      caption: str(p?.caption, 2200).trim(),
      hashtags: arr<unknown>(p?.hashtags, 8)
        .map((h) => String(h).replace(/[^\p{L}\p{N}_]/gu, ''))
        .filter((h) => h.length > 0 && h.length <= 60),
      visual: str(p?.visual, 400),
      why: str(p?.why, 300),
    })),
    goals: arr<StrategyDraft['goals'][number]>(out?.goals, 5).map((g, i) => ({
      id: str(g?.id, 20) || `g${i + 1}`,
      scope: g?.scope === 'POSTS' ? 'POSTS' : g?.scope === 'WEBSITE' ? 'WEBSITE' : 'ADS',
      network: g?.network === 'FACEBOOK' || g?.network === 'INSTAGRAM' ? g.network : null,
      metric: str(g?.metric, 40),
      target: num(g?.target, 0, 1e9, 0),
      windowDays: g?.windowDays === 30 ? 30 : 7,
      why: str(g?.why, 300),
    })),
    weekly: str(out?.weekly, 600),
    risks: arr<unknown>(out?.risks, 3).map((x) => str(x, 300)),
  }
}

// ─── Weekly review ─────────────────────────────────────────────────────────

export type ReviewRec = {
  kind: 'post' | 'repeat' | 'goal' | 'budget' | 'creative' | 'pause' | 'other'
  title: string
  why: string
  impact: 'high' | 'medium' | 'low'
  campaign?: string
  amountPerDay?: number
  steps?: string[]
  creative?: { headline: string; primaryText: string; visual: string }
  post?: { date: string; time: string; network: string; format: string; caption: string; hashtags: string[]; visual: string }
  goal?: { scope: 'ADS' | 'POSTS'; network?: string | null; metric: string; target: number; windowDays: number }
}

export type ReviewDraft = {
  headline: string
  summary: string
  wins: { text: string; evidence: string }[]
  issues: { text: string; evidence: string }[]
  recommendations: ReviewRec[]
}

// The agency's Monday meeting: what happened last week, why, and the next
// concrete steps.
export async function weeklyReview(brandName: string, brand: Brand | null, facts: unknown, language: PostOptions['language']): Promise<ReviewDraft> {
  const system = [
    'You are the account lead of a social media and performance agency writing the client’s Monday review of the last 7 days.',
    'Rules:',
    '- Use only the numbers given; cite them as evidence. Compare with the week before. Explain likely causes in plain words.',
    '- If there was no activity, say so and make getting started the first recommendation.',
    '- 3–7 recommendations, most valuable first, each specific enough to act on today. Kinds:',
    '  "post": a ready post for the next 7 days {"post":{"date","time","network":"FACEBOOK"|"INSTAGRAM","format","caption","hashtags":[],"visual"}}; use the formats, days and times that worked.',
    '  "repeat": like "post" but a new take on one of last week’s best posts — name it in "why".',
    '  "goal": a target worth watching {"goal":{"scope":"ADS"|"POSTS","network":null|"FACEBOOK"|"INSTAGRAM","metric": one of cost_per_result, results, ctr, cpm, spend, posts, reach, avg_reach, engagements, engagement_rate, views,"target","windowDays":7|30}} — only if no existing goal covers it.',
    '  "budget": move or change daily budget {"campaign": exact campaign name,"amountPerDay","steps":[]}.',
    '  "creative": refresh a tired ad {"campaign","creative":{"headline","primaryText","visual"},"steps":[]}.',
    '  "pause": stop a campaign or ad wasting money {"campaign","steps":[]}.',
    '  "other": anything else {"steps":[]}.',
    '- Campaign names must match the facts exactly. Never invent offers, prices or results. Respect "Never repeat" from the dossier.',
    brandContext(brandName, brand),
    MARKETING_PLAYBOOK,
    `Write in ${language}.`,
    'Return JSON {"headline": one sentence, "summary": 3-4 sentences, "wins": [{"text","evidence"}] 0-3, "issues": [{"text","evidence"}] 0-3, "recommendations": [{"kind","title","why","impact": "high"|"medium"|"low", ...kind fields}]}.',
  ].join('\n\n')
  const out = await json<Partial<ReviewDraft>>(system, `Facts:\n${JSON.stringify(facts)}`, 9000, 120_000)
  const str = (v: unknown, n = 500) => String(v ?? '').slice(0, n)
  const items = (v: unknown, n: number) =>
    (Array.isArray(v) ? v : [])
      .slice(0, n)
      .map((x) => ({ text: str(x?.text, 400), evidence: str(x?.evidence, 400) }))
      .filter((x) => x.text)
  const kinds = ['post', 'repeat', 'goal', 'budget', 'creative', 'pause', 'other']
  return {
    headline: str(out?.headline, 300),
    summary: str(out?.summary, 1500),
    wins: items(out?.wins, 3),
    issues: items(out?.issues, 3),
    recommendations: (Array.isArray(out?.recommendations) ? out.recommendations : []).slice(0, 7).flatMap((r): ReviewRec[] => {
      if (!r || !kinds.includes(String(r.kind)) || !r.title) return []
      return [
        {
          kind: r.kind as ReviewRec['kind'],
          title: str(r.title, 200),
          why: str(r.why, 600),
          impact: (['high', 'medium', 'low'].includes(String(r.impact)) ? r.impact : 'medium') as ReviewRec['impact'],
          ...(r.campaign ? { campaign: str(r.campaign, 200) } : {}),
          ...(Number.isFinite(Number(r.amountPerDay)) && Number(r.amountPerDay) > 0 ? { amountPerDay: Number(r.amountPerDay) } : {}),
          ...(Array.isArray(r.steps) ? { steps: r.steps.slice(0, 6).map((x) => str(x, 300)) } : {}),
          ...(r.creative ? { creative: { headline: str(r.creative.headline, 120), primaryText: str(r.creative.primaryText, 1200), visual: str(r.creative.visual, 400) } } : {}),
          ...(r.post
            ? {
                post: {
                  date: str(r.post.date, 10),
                  time: /^\d{2}:\d{2}$/.test(String(r.post.time)) ? String(r.post.time) : '10:00',
                  network: r.post.network === 'FACEBOOK' ? 'FACEBOOK' : 'INSTAGRAM',
                  format: str(r.post.format, 30),
                  caption: str(r.post.caption, 2200).trim(),
                  hashtags: (Array.isArray(r.post.hashtags) ? r.post.hashtags : [])
                    .map((h) => String(h).replace(/[^\p{L}\p{N}_]/gu, ''))
                    .filter((h) => h.length > 0 && h.length <= 60)
                    .slice(0, 8),
                  visual: str(r.post.visual, 400),
                },
              }
            : {}),
          ...(r.goal
            ? {
                goal: {
                  scope: r.goal.scope === 'POSTS' ? 'POSTS' : 'ADS',
                  network: r.goal.network === 'FACEBOOK' || r.goal.network === 'INSTAGRAM' ? r.goal.network : null,
                  metric: str(r.goal.metric, 40),
                  target: Number(r.goal.target) || 0,
                  windowDays: r.goal.windowDays === 30 ? 30 : 7,
                },
              }
            : {}),
        },
      ]
    }),
  }
}

// A reply to a direct message, in the language the person wrote in.
export async function suggestReply(
  brandName: string,
  brand: Brand | null,
  thread: { fromMe: boolean; text: string; at: string }[],
): Promise<string> {
  const system = [
    'You answer direct messages for one brand on Facebook Messenger and Instagram, like its best community manager.',
    'Rules: reply in the language of the customer’s last message; short (1–4 sentences), warm and helpful; answer what they asked.',
    'Never invent prices, availability, dates, addresses or promises that are not in the brand details or the thread — if unknown, say a teammate will confirm and ask for what you need (phone, preferred time, etc.).',
    brandContext(brandName, brand),
    'Return JSON {"reply": string}.',
  ].join('\n\n')
  const lines = thread.map((m) => `${m.fromMe ? brandName : 'Customer'} (${m.at}): ${m.text || '[attachment]'}`).join('\n')
  const out = await json<{ reply?: string }>(system, `Conversation, oldest first:\n${lines}`, 2500, 45_000)
  const reply = String(out?.reply ?? '').trim()
  if (!reply) throw new Error('Empty AI reply')
  return reply.slice(0, 2000)
}

// One interview per brief: at most this many questions, then final ideas.
export const BRIEF_QUESTIONS = 10

export type BriefAdvice = {
  known: string[]
  audiences: { name: string; where: string; who: string; wants: string; how: string }[]
  questions: { question: string; why: string; options: string[] }[]
  ideas: { title: string; why: string; network: 'FACEBOOK' | 'INSTAGRAM' | 'BOTH'; format: string; audience: string; prompt: string; caption: string }[]
}

// The agency's first move before any post or campaign: who to talk to
// (location + product), what is still unknown (asked, with likely answers),
// and ideas that follow from the data. Never guesses facts it was not given.
export async function adviseBrief(
  brandName: string,
  brand: Brand | null,
  input: { kind: 'post' | 'campaign'; goal: string; performance: unknown; language: PostOptions['language']; final?: boolean },
): Promise<BriefAdvice> {
  const system = [
    'You are the strategist of a marketing agency. A client is about to create a social ' + (input.kind === 'campaign' ? 'campaign' : 'post') + '. Many clients do not know their audience — you help.',
    'Do this:',
    '1. "known": 2–6 short facts you rely on (from the brand details, dossier, owner answers and performance). No guesses.',
    '2. "audiences": 2–3 audience segments for THIS product in THIS location: "where" (city/area/country, or online), "who" (age, situation, interests), "wants" (need or pain), "how" (angle and channel that reaches them). If the location or product is unknown, still propose likely segments but say so in "who" and ask about it.',
    input.final
      ? '3. "questions": always an empty array — the owner has already answered your questions; work with what you know.'
      : `3. "questions": up to ${BRIEF_QUESTIONS} questions about what you truly need and do not know (e.g. where they sell, main product to promote, price range, offer/deadline, who buys), most important first; ask only what changes the plan. Never ask what is already answered in "The owner told us". Each with "why" and 2–4 likely answer "options" written as the owner would answer.`,
    '4. "ideas": 3 concrete ' + (input.kind === 'campaign' ? 'campaign ideas (a theme for several posts)' : 'post ideas') + ' that follow from the data and the goal: "title", "why" (cite the fact or number), "network" FACEBOOK|INSTAGRAM|BOTH, "format" (Reel, Carousel, Photo, Story, Text), "audience" (exactly the "name" of one of your audiences), "prompt" (a brief for the copywriter, 1–3 sentences), "caption" (a ready first draft, ≤ 400 characters, no hashtags).',
    'Audience "name" is a short label of 2–5 words (e.g. "Weekend party hosts"); details go in "who".',
    'Use the formats, days and topics that worked; avoid what did not. Never invent prices, offers, dates or numbers.',
    brandContext(brandName, brand),
    MARKETING_PLAYBOOK,
    `Write everything in ${input.language}.`,
    'Return JSON {"known": string[], "audiences": [...], "questions": [...], "ideas": [...]}.',
  ].join('\n\n')
  const str = { type: 'string' }
  const obj = (props: Record<string, unknown>) => ({ type: 'object', properties: props, required: Object.keys(props) })
  const schema = obj({
    known: { type: 'array', items: str },
    audiences: { type: 'array', items: obj({ name: str, where: str, who: str, wants: str, how: str }) },
    questions: { type: 'array', items: obj({ question: str, why: str, options: { type: 'array', items: str } }) },
    ideas: {
      type: 'array',
      items: obj({ title: str, why: str, network: { type: 'string', enum: ['FACEBOOK', 'INSTAGRAM', 'BOTH'] }, format: str, audience: str, prompt: str, caption: str }),
    },
  })
  const out = await json<Partial<BriefAdvice>>(
    system,
    [`Goal from the client: ${input.goal || '(none — suggest what to do)'}`, `Recent performance: ${JSON.stringify(input.performance)}`].join('\n\n'),
    8000,
    90_000,
    schema,
  )
  const s = (v: unknown, n = 300) => String(v ?? '').trim().slice(0, n)
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  return {
    known: arr(out?.known).map((x) => s(x, 200)).filter(Boolean).slice(0, 6),
    audiences: arr(out?.audiences)
      .slice(0, 3)
      .map((a) => ({ name: s(a?.name, 80), where: s(a?.where, 120), who: s(a?.who), wants: s(a?.wants), how: s(a?.how) }))
      .filter((a) => a.name),
    questions: (input.final ? [] : arr(out?.questions))
      .slice(0, BRIEF_QUESTIONS)
      .map((q) => ({ question: s(q?.question, 200), why: s(q?.why, 200), options: arr(q?.options).map((o) => s(o, 120)).filter(Boolean).slice(0, 4) }))
      .filter((q) => q.question),
    ideas: arr(out?.ideas)
      .slice(0, 3)
      .map((i) => ({
        title: s(i?.title, 120),
        why: s(i?.why),
        network: (['FACEBOOK', 'INSTAGRAM'].includes(String(i?.network)) ? i.network : 'BOTH') as BriefAdvice['ideas'][number]['network'],
        format: s(i?.format, 30),
        audience: s(i?.audience, 80),
        prompt: s(i?.prompt, 600),
        caption: s(i?.caption, 600),
      }))
      .filter((i) => i.title && i.prompt),
  }
}

export type VideoScript = {
  title: string
  caption: string
  hashtags: string[]
  scenes: { text: string; voice: string; visual: string; seconds: number }[]
}

// A short vertical video: hook in the first scene, one idea per scene, a
// clear call to action at the end. On-screen text is short; the voice-over
// carries the detail.
export async function videoScript(
  brandName: string,
  brand: Brand | null,
  input: { brief: string; scenes: number; language: PostOptions['language']; voice: boolean },
): Promise<VideoScript> {
  const system = [
    'You write short social videos (Reels, Stories, TikTok) for one brand.',
    `Write exactly ${input.scenes} scenes. Scene 1 is a hook that stops the scroll; the last scene is a clear call to action.`,
    '"text": on-screen text, at most 7 words. ' + (input.voice ? '"voice": the voice-over line for the scene, natural spoken language, 6–18 words.' : '"voice": empty string.'),
    '"visual": what the footage or image should show (a description for a photographer or an image generator; no text in the image).',
    '"seconds": 2–5.',
    'Also "title" (internal name), "caption" (the post text, ≤ 400 characters) and 3–6 "hashtags" without #.',
    'Never invent prices, offers, dates or facts that are not in the brief or the brand details.',
    brandContext(brandName, brand),
    COPY_RULES,
    `Write text, voice and caption in ${input.language}.`,
  ].join('\n\n')
  const str = { type: 'string' }
  const schema = {
    type: 'object',
    properties: {
      title: str,
      caption: str,
      hashtags: { type: 'array', items: str },
      scenes: {
        type: 'array',
        items: { type: 'object', properties: { text: str, voice: str, visual: str, seconds: { type: 'number' } }, required: ['text', 'voice', 'visual', 'seconds'] },
      },
    },
    required: ['title', 'caption', 'hashtags', 'scenes'],
  }
  const out = await json<Partial<VideoScript>>(system, `Brief: ${input.brief}`, 6000, 90_000, schema)
  const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)
  const scenes = (Array.isArray(out?.scenes) ? out.scenes : []).slice(0, 12).map((x) => ({
    text: s(x?.text, 80),
    voice: input.voice ? s(x?.voice, 300) : '',
    visual: s(x?.visual, 400),
    seconds: Math.min(6, Math.max(2, Number(x?.seconds) || 3)),
  }))
  if (scenes.length === 0) throw new Error('Empty video script')
  return {
    title: s(out?.title, 80) || 'AI video',
    caption: s(out?.caption, 2000),
    hashtags: (Array.isArray(out?.hashtags) ? out.hashtags : []).map((h) => String(h).replace(/[^\p{L}\p{N}_]/gu, '')).filter((h) => h && h.length <= 60).slice(0, 8),
    scenes,
  }
}

const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts'

// Spoken line as a WAV file (24 kHz mono 16-bit).
export async function speak(text: string, voiceName: string): Promise<{ wav: Buffer; ms: number }> {
  if (!client) throw new Error('AI is not configured')
  const res = await client.models.generateContent({
    model: TTS_MODEL,
    contents: [{ role: 'user', parts: [{ text: `Read this naturally, like a friendly ad voice-over:\n${text}` }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      abortSignal: AbortSignal.timeout(60_000),
    },
  })
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
  if (!part?.inlineData?.data) throw new Error('No audio returned')
  const pcm = Buffer.from(part.inlineData.data, 'base64')
  const rate = Number(part.inlineData.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return { wav: Buffer.concat([header, pcm]), ms: Math.round((pcm.length / 2 / rate) * 1000) }
}

// Background music with Lyria 3 (Gemini API): a ~30-second instrumental MP3.
const MUSIC_MODEL = process.env.GEMINI_MUSIC_MODEL || 'lyria-3-clip-preview'

export async function generateMusic(prompt: string): Promise<{ data: Buffer; mime: string }> {
  if (!client) throw new Error('AI is not configured')
  const res = await client.models.generateContent({
    model: MUSIC_MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: `Background music for a short social media video. Instrumental only, no vocals, no lyrics. Loops cleanly, steady energy. ${prompt}` }],
      },
    ],
    config: { responseModalities: ['AUDIO', 'TEXT'], abortSignal: AbortSignal.timeout(120_000) },
  })
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
  if (!part?.inlineData?.data) throw new Error('No music returned')
  return { data: Buffer.from(part.inlineData.data, 'base64'), mime: part.inlineData.mimeType?.split(';')[0] || 'audio/mpeg' }
}

const ADVICE_SCHEMA = (() => {
  const str = { type: 'string' }
  const obj = (props: Record<string, unknown>) => ({ type: 'object', properties: props, required: Object.keys(props) })
  return obj({
    known: { type: 'array', items: str },
    audiences: { type: 'array', items: obj({ name: str, where: str, who: str, wants: str, how: str }) },
    questions: { type: 'array', items: obj({ question: str, why: str, options: { type: 'array', items: str } }) },
    ideas: {
      type: 'array',
      items: obj({ title: str, why: str, network: { type: 'string', enum: ['FACEBOOK', 'INSTAGRAM', 'BOTH'] }, format: str, audience: str, prompt: str, caption: str }),
    },
  })
})()

// The same suggestions in another language: same items, same order; brand
// and place names stay as they are.
export async function translateAdvice(advice: BriefAdvice, language: PostOptions['language']): Promise<BriefAdvice> {
  const system = [
    `Translate every text value of this JSON into ${language}. Keep the structure, the number and order of items, and the "network" values exactly.`,
    'Keep brand names, product names, place names and hashtags as they are. Natural marketing language, not word-for-word.',
    'Each idea\'s "audience" must stay identical to the translated "name" of the audience it refers to.',
  ].join('\n')
  const out = await json<BriefAdvice>(system, JSON.stringify(advice), 8000, 60_000, ADVICE_SCHEMA)
  const same = (a: unknown[] | undefined, b: unknown[]) => Array.isArray(a) && a.length === b.length
  if (!out || !same(out.audiences, advice.audiences) || !same(out.questions, advice.questions) || !same(out.ideas, advice.ideas)) throw new Error('Translation changed the structure')
  return { ...out, ideas: out.ideas.map((i, n) => ({ ...i, network: advice.ideas[n].network })) }
}

// ─── Competitors ───────────────────────────────────────────────────────────

export type FoundCompetitor = { name: string; website: string; why: string }

// Real companies from Google Search (grounding), not guesses: the same
// business type in the same place. The owner confirms which to follow.
export async function findCompetitors(brandName: string, profile: CompanyProfile | null, brand: Brand | null, exclude: string[]): Promise<FoundCompetitor[]> {
  if (!client) throw new Error('AI is not configured')
  const about = [
    `Company: ${brandName}`,
    brand?.website && `Website: ${brand.website}`,
    profile?.summary && `What they do: ${profile.summary}`,
    profile?.industry && `Industry: ${profile.industry}`,
    profile?.locations.length ? `Where: ${profile.locations.join(', ')}` : '',
    profile?.offerings.length ? `Offers: ${profile.offerings.map((o) => o.name).join(', ')}` : '',
    exclude.length ? `Already listed (skip them): ${exclude.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const res = await retrying((model) =>
    client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${about}\n\nSearch the web and find up to 5 direct competitors: real companies offering the same kind of product or service to the same customers in the same city or country. Only companies you found in search results, with their real website. Return ONLY a JSON array: [{"name": string, "website": "https://…", "why": "one short sentence: why they compete"}].`,
            },
          ],
        },
      ],
      config: { tools: [{ googleSearch: {} }], maxOutputTokens: 2000, abortSignal: AbortSignal.timeout(90_000) },
    }),
  )
  const text = (res.text ?? '').replace(/```(json)?/g, '').trim()
  const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
  let list: unknown = []
  try {
    list = JSON.parse(json || '[]')
  } catch {
    list = []
  }
  return (Array.isArray(list) ? list : [])
    .map((c) => ({ name: String(c?.name ?? '').slice(0, 80), website: String(c?.website ?? '').slice(0, 200), why: String(c?.why ?? '').slice(0, 200) }))
    .filter((c) => c.name && /^https?:\/\/[^\s/]+\.[^\s]+/.test(c.website))
    .slice(0, 5)
}

export type CompetitorReportData = {
  summary: string
  positioning: string
  table: { dimension: string; us: string; them: { name: string; value: string }[] }[]
  wins: string[]
  gaps: string[]
  perCompetitor: { name: string; strengths: string[]; weaknesses: string[] }[]
  actions: { title: string; why: string; kind: 'post' | 'campaign' | 'offer' | 'website' | 'ads' }[]
}

// "Us vs them" from the website profiles and the owner's notes.
export async function compareCompetitors(
  brandName: string,
  brand: Brand | null,
  own: CompanyProfile | null,
  rivals: { name: string; website: string | null; notes: string; profile: CompanyProfile | null }[],
  language: PostOptions['language'],
): Promise<CompetitorReportData> {
  const system = [
    'You are the strategist of a marketing agency comparing a client with its competitors.',
    'Use only what the profiles and notes say; where something is unknown write "not stated". Never invent prices or claims.',
    'Do this:',
    '- "summary": 2–3 sentences: how the market looks and where the client stands.',
    '- "positioning": one sentence — the position the client should own against these competitors.',
    '- "table": rows for these dimensions in this order: Offer, Prices, Unique selling points, Audience, Tone & content, Proof & trust. "us" = the client; "them" = one value per competitor (same order as given). Short phrases.',
    '- "wins": 2–5 things the client does better.',
    '- "gaps": 2–5 things competitors do better or that the client is missing.',
    '- "perCompetitor": strengths and weaknesses of each (1–3 each).',
    '- "actions": 3–6 concrete marketing actions (kind: post | campaign | offer | website | ads) with "why" citing the comparison.',
    brandContext(brandName, brand),
    MARKETING_PLAYBOOK,
    `Write everything in ${language}.`,
  ].join('\n\n')
  const str = { type: 'string' }
  const list = { type: 'array', items: str }
  const obj = (props: Record<string, unknown>) => ({ type: 'object', properties: props, required: Object.keys(props) })
  const schema = obj({
    summary: str,
    positioning: str,
    table: { type: 'array', items: obj({ dimension: str, us: str, them: { type: 'array', items: obj({ name: str, value: str }) } }) },
    wins: list,
    gaps: list,
    perCompetitor: { type: 'array', items: obj({ name: str, strengths: list, weaknesses: list }) },
    actions: { type: 'array', items: obj({ title: str, why: str, kind: { type: 'string', enum: ['post', 'campaign', 'offer', 'website', 'ads'] } }) },
  })
  const out = await json<CompetitorReportData>(system, JSON.stringify({ client: own, competitors: rivals }), 8000, 120_000, schema)
  const s = (v: unknown, n = 400) => String(v ?? '').trim().slice(0, n)
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  return {
    summary: s(out?.summary, 800),
    positioning: s(out?.positioning),
    table: arr(out?.table)
      .slice(0, 8)
      .map((r) => ({ dimension: s(r?.dimension, 60), us: s(r?.us), them: arr(r?.them).slice(0, 8).map((t) => ({ name: s(t?.name, 80), value: s(t?.value) })) })),
    wins: arr(out?.wins).map((x) => s(x)).filter(Boolean).slice(0, 6),
    gaps: arr(out?.gaps).map((x) => s(x)).filter(Boolean).slice(0, 6),
    perCompetitor: arr(out?.perCompetitor)
      .slice(0, 8)
      .map((c) => ({ name: s(c?.name, 80), strengths: arr(c?.strengths).map((x) => s(x)).slice(0, 3), weaknesses: arr(c?.weaknesses).map((x) => s(x)).slice(0, 3) })),
    actions: arr(out?.actions)
      .slice(0, 6)
      .map((a) => ({ title: s(a?.title, 160), why: s(a?.why), kind: (['post', 'campaign', 'offer', 'website', 'ads'].includes(a?.kind) ? a.kind : 'post') as CompetitorReportData['actions'][number]['kind'] }))
      .filter((a) => a.title),
  }
}

// ─── Brandbook ─────────────────────────────────────────────────────────────

export type BrandbookData = {
  name: string
  summary: string
  mission: string
  values: string[]
  personality: string[]
  audience: string
  voice: { tone: string; do: string[]; dont: string[]; words: string[] }
  colors: { hex: string; name: string; role: string }[]
  fonts: { heading: string; body: string }
  logo: string[]
  imagery: { style: string; do: string[]; dont: string[] }
  taglines: string[]
}

const BOOK_SCHEMA = (() => {
  const str = { type: 'string' }
  const list = { type: 'array', items: str }
  const obj = (props: Record<string, unknown>) => ({ type: 'object', properties: props, required: Object.keys(props) })
  return obj({
    name: str,
    summary: str,
    mission: str,
    values: list,
    personality: list,
    audience: str,
    voice: obj({ tone: str, do: list, dont: list, words: list }),
    colors: { type: 'array', items: obj({ hex: str, name: str, role: str }) },
    fonts: obj({ heading: str, body: str }),
    logo: list,
    imagery: obj({ style: str, do: list, dont: list }),
    taglines: list,
  })
})()

export function cleanBook(b: Partial<BrandbookData> | null | undefined): BrandbookData {
  const s = (v: unknown, n = 300) => String(v ?? '').trim().slice(0, n)
  const arr = (v: unknown, n = 8, len = 200) => (Array.isArray(v) ? v.map((x) => s(x, len)).filter(Boolean).slice(0, n) : [])
  const hex = (v: unknown) => {
    const m = s(v, 9).match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i)
    if (!m) return null
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
    return `#${h.toUpperCase()}`
  }
  return {
    name: s(b?.name, 80),
    summary: s(b?.summary, 600),
    mission: s(b?.mission, 400),
    values: arr(b?.values, 6, 80),
    personality: arr(b?.personality, 6, 40),
    audience: s(b?.audience, 400),
    voice: { tone: s(b?.voice?.tone, 300), do: arr(b?.voice?.do, 6), dont: arr(b?.voice?.dont, 6), words: arr(b?.voice?.words, 12, 40) },
    colors: (Array.isArray(b?.colors) ? b!.colors : [])
      .map((c) => ({ hex: hex(c?.hex), name: s(c?.name, 40), role: s(c?.role, 60) }))
      .filter((c): c is { hex: string; name: string; role: string } => !!c.hex)
      .slice(0, 8),
    fonts: { heading: s(b?.fonts?.heading, 60), body: s(b?.fonts?.body, 60) },
    logo: arr(b?.logo, 6),
    imagery: { style: s(b?.imagery?.style, 300), do: arr(b?.imagery?.do, 5), dont: arr(b?.imagery?.dont, 5) },
    taglines: arr(b?.taglines, 5, 120),
  }
}

// Reads the owner's brandbook (PDF or page images) — only what it says.
export async function readBrandbook(brandName: string, files: { mime: string; data: string }[]): Promise<BrandbookData> {
  if (!client) throw new Error('AI is not configured')
  const system = [
    `You read the brandbook (brand guidelines) of "${brandName}" for a marketing agency.`,
    'Extract only what the document states. Colours as HEX (convert RGB/CMYK/Pantone to the closest HEX), each with its name and role (primary, secondary, accent, background, text). Fonts as named. Leave a field empty when the document does not say it.',
    'Write in English, keep brand names and taglines in their original language.',
  ].join('\n')
  const res = await retrying((model) =>
    client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [...files.map((f) => ({ inlineData: { mimeType: f.mime, data: f.data } })), { text: 'Extract the brand guidelines.' }] }],
      config: { systemInstruction: system, responseMimeType: 'application/json', responseJsonSchema: BOOK_SCHEMA, maxOutputTokens: 8000, abortSignal: AbortSignal.timeout(180_000) },
    }),
  )
  return cleanBook(JSON.parse(res.text ?? 'null'))
}

// No brandbook yet: three distinct directions from the brand, its audience
// and the owner's answers. Fonts only from the given list.
export async function designBrandbook(
  brandName: string,
  brand: Brand | null,
  answers: { personality: string[]; audience: string; avoid: string; colors: string },
  fonts: readonly string[],
  language: PostOptions['language'],
): Promise<BrandbookData[]> {
  const system = [
    'You are a brand designer at a marketing agency creating a brandbook for a small or medium business.',
    'Create THREE clearly different directions (e.g. one classic, one bold, one warm/friendly) that all fit the company and the owner\'s answers.',
    'Each direction is a full brandbook: name (of the direction), summary, mission, 3–5 values, personality traits, audience, voice (tone, do, dont, signature words), 5 colours with HEX, name and role (primary, secondary, accent, background, text) with good contrast, fonts (heading and body ONLY from this list: ' + fonts.join(', ') + '), logo usage rules, imagery style with do/dont, 3 taglines.',
    'Keep what the company already uses when it is known (colours, tone) unless the owner asks for a change.',
    brandContext(brandName, brand),
    `Write in ${language}; keep HEX codes and font names as is.`,
    'Return JSON {"directions": [3 brandbooks]}.',
  ].join('\n\n')
  const out = await json<{ directions?: Partial<BrandbookData>[] }>(
    system,
    JSON.stringify({ ownerAnswers: answers }),
    12000,
    150_000,
    { type: 'object', properties: { directions: { type: 'array', items: BOOK_SCHEMA } }, required: ['directions'] },
  )
  const list = (out?.directions ?? []).map(cleanBook).map((b) => ({
    ...b,
    fonts: { heading: fonts.includes(b.fonts.heading) ? b.fonts.heading : fonts[0], body: fonts.includes(b.fonts.body) ? b.fonts.body : fonts[0] },
  }))
  if (list.length === 0) throw new Error('No directions')
  return list.slice(0, 3)
}

// ─── Plan vs actual ───────────────────────────────────────────────────────

export type ResultsExplanation = { headline: string; why: string[]; next: string[] }

// Why the results differ from the plan, and what to change next.
export async function explainResults(brandName: string, brand: Brand | null, comparison: unknown, language: PostOptions['language']): Promise<ResultsExplanation> {
  const system = [
    'You are the account manager of a marketing agency explaining to the client how a plan went: what was planned vs what happened.',
    'Use only the rows given. Be honest about misses, credit wins. If the period is still running, say so and judge the pace.',
    '"headline": one sentence verdict. "why": 2–4 likely reasons for the gaps, citing the rows (and the playbook where relevant). "next": 2–4 concrete changes for the next period.',
    brandContext(brandName, brand),
    MARKETING_PLAYBOOK,
    `Write in ${language}. Return JSON {"headline": string, "why": string[], "next": string[]}.`,
  ].join('\n\n')
  const str = { type: 'string' }
  const out = await json<ResultsExplanation>(system, JSON.stringify(comparison), 3000, 60_000, {
    type: 'object',
    properties: { headline: str, why: { type: 'array', items: str }, next: { type: 'array', items: str } },
    required: ['headline', 'why', 'next'],
  })
  const s = (v: unknown, n = 300) => String(v ?? '').trim().slice(0, n)
  return {
    headline: s(out?.headline),
    why: (Array.isArray(out?.why) ? out.why : []).map((x) => s(x)).filter(Boolean).slice(0, 4),
    next: (Array.isArray(out?.next) ? out.next : []).map((x) => s(x)).filter(Boolean).slice(0, 4),
  }
}

// ─── SEO ──────────────────────────────────────────────────────────────────

export type SeoActions = { summary: string; actions: { title: string; why: string; how: string; impact: 'high' | 'medium' | 'low' }[] }

// What to do about the SEO check: the most valuable fixes first, with
// rewritten titles and descriptions and content ideas from real searches.
export async function seoAdvice(brandName: string, brand: Brand | null, report: unknown, language: PostOptions['language']): Promise<SeoActions> {
  const system = [
    'You are a senior SEO consultant writing the action list for a small business website.',
    'Use only the data given: the technical checks, the pages read, and (if present) Google Search Console queries with clicks, impressions, CTR and position.',
    'Order by impact on getting customers from Google. Be concrete: for title/description fixes write the new text; for "almost on page one" searches name the page and what to add; for content, name 1–3 page or article ideas from real queries.',
    'Also cover how to be cited by AI assistants (Google AI Overviews, ChatGPT, Gemini) when relevant: clear answers, FAQ, structured data, consistent business details.',
    '"summary": 2 sentences on where the site stands. "actions": 5–8 items, each {title, why (cite the data), how (steps or the exact text), impact: high|medium|low}.',
    brandContext(brandName, brand),
    `Write in ${language}. Return JSON.`,
  ].join('\n\n')
  const str = { type: 'string' }
  const out = await json<SeoActions>(system, JSON.stringify(report), 6000, 90_000, {
    type: 'object',
    properties: {
      summary: str,
      actions: {
        type: 'array',
        items: { type: 'object', properties: { title: str, why: str, how: str, impact: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['title', 'why', 'how', 'impact'] },
      },
    },
    required: ['summary', 'actions'],
  })
  const s = (v: unknown, n = 600) => String(v ?? '').trim().slice(0, n)
  return {
    summary: s(out?.summary, 500),
    actions: (Array.isArray(out?.actions) ? out.actions : [])
      .map((a) => ({ title: s(a?.title, 160), why: s(a?.why), how: s(a?.how, 1200), impact: (['high', 'medium', 'low'].includes(a?.impact) ? a.impact : 'medium') as 'high' | 'medium' | 'low' }))
      .filter((a) => a.title)
      .slice(0, 8),
  }
}

// ─── AI search (GEO) ──────────────────────────────────────────────────────

// Questions a potential customer would ask an AI assistant when looking for
// what the company sells — without naming the company.
export async function aiSearchQuestions(brandName: string, brand: Brand | null, seeds: string[], language: PostOptions['language']): Promise<string[]> {
  const system = [
    'You write the questions real people type into ChatGPT, Gemini or Google AI Mode when they look for a product or service like the company’s.',
    'Write 6 natural, specific questions: "best …", "where to …", "who does …", comparisons, price questions — with the city or country when the business is local.',
    'Never name the company itself: we test whether the AI recommends it on its own.',
    seeds.length ? `Real Google searches that bring people to the site (use them as inspiration): ${seeds.slice(0, 15).join('; ')}` : '',
    brandContext(brandName, brand),
    `Write the questions in ${language}. Return JSON {"questions": string[]}.`,
  ]
    .filter(Boolean)
    .join('\n\n')
  const out = await json<{ questions: string[] }>(system, 'Write the questions.', 1500, 60_000, {
    type: 'object',
    properties: { questions: { type: 'array', items: { type: 'string' } } },
    required: ['questions'],
  })
  const name = brandName.toLowerCase()
  return (Array.isArray(out?.questions) ? out.questions : [])
    .map((q) => String(q ?? '').trim().slice(0, 200))
    .filter((q) => q && !q.toLowerCase().includes(name))
    .slice(0, 6)
}

export type AiAnswer = { answer: string; businesses: string[]; sources: { title: string; url: string }[] }

// Answer like an AI assistant with Google Search, and say which businesses
// the answer recommends and which pages it used.
export async function askAiSearch(question: string): Promise<AiAnswer> {
  if (!client) throw new Error('AI is not configured')
  const res = await retrying((model) =>
    client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${question}\n\nAnswer the way an AI assistant answers a customer: short, with concrete recommendations found in search. Then on the very last line write "BUSINESSES:" followed by the names of the businesses or brands you recommended, separated by "; " (or "none").`,
            },
          ],
        },
      ],
      config: { tools: [{ googleSearch: {} }], maxOutputTokens: 1500, abortSignal: AbortSignal.timeout(90_000) },
    }),
  )
  const text = (res.text ?? '').trim()
  const m = text.match(/BUSINESSES:\s*(.*)\s*$/i)
  const businesses = m && !/^none\.?$/i.test(m[1].trim()) ? m[1].split(/;\s*/).map((b) => b.replace(/[*_]/g, '').trim()).filter(Boolean).slice(0, 12) : []
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  const sources = chunks
    .flatMap((c) => (c.web?.uri ? [{ title: String(c.web.title ?? '').slice(0, 120), url: c.web.uri }] : []))
    .filter((s, i, all) => all.findIndex((x) => x.title === s.title) === i)
    .slice(0, 10)
  return { answer: (m ? text.slice(0, m.index) : text).trim().slice(0, 3000), businesses, sources }
}
