import 'server-only'
import { GoogleGenAI, type Part } from '@google/genai'
import type { BrandKit } from '@prisma/client'

// GEMINI_API_KEY enables generation. GEMINI_MODEL / GEMINI_IMAGE_MODEL
// override the defaults.
const key = process.env.GEMINI_API_KEY
const client = key ? new GoogleGenAI({ apiKey: key }) : null
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'
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

function brandContext(name: string, brand: BrandKit | null) {
  return [
    `Brand: ${name}`,
    brand?.website && `Website: ${brand.website}`,
    brand?.description && `About: ${brand.description}`,
    brand?.audience && `Audience: ${brand.audience}`,
    brand?.voice && `Voice: ${brand.voice}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function generatePost(brandName: string, brand: BrandKit | null, o: PostOptions): Promise<GeneratedPost> {
  if (!client) throw new Error('AI is not configured')
  const system = [
    'You write social media posts for one brand. Stay strictly on brand and never invent prices, dates, offers or facts that are not in the request, the attached images or the brand details.',
    brandContext(brandName, brand),
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
  const res = await client.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      maxOutputTokens: 1500,
      abortSignal: AbortSignal.timeout(45_000),
    },
  })
  const parsed = JSON.parse(res.text ?? '{}') as Partial<GeneratedPost>
  if (!parsed.caption) throw new Error('Empty AI response')
  return {
    caption: String(parsed.caption).trim(),
    hashtags: (parsed.hashtags ?? []).map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean).slice(0, 8),
  }
}

// One square social image for the post, in the brand's colours.
export async function generateImage(
  brandName: string,
  brand: BrandKit | null,
  brief: string,
  caption: string,
  variant: number,
  attachments: Attachment[],
): Promise<{ data: Buffer; mime: string }> {
  if (!client) throw new Error('AI is not configured')
  const prompt = [
    `Create a square (1:1) social media image for the brand "${brandName}".`,
    brand?.description && `About the brand: ${brand.description}`,
    brand?.colors.length ? `Use the brand colours ${brand.colors.join(', ')} as the dominant palette.` : '',
    `Post brief: ${brief}`,
    `Post caption: ${caption.slice(0, 600)}`,
    attachments.length ? 'Use the attached images as the product/subject reference — keep it recognisable.' : '',
    'Photorealistic or clean modern graphic style. No words, letters, logos or watermarks in the image.',
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
        config: { responseModalities: ['IMAGE'], abortSignal: AbortSignal.timeout(90_000) },
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
  throw lastError ?? new Error('Image generation failed')
}

// ─── Campaigns & blog ──────────────────────────────────────────────────────

async function json<T>(system: string, prompt: string, maxOutputTokens: number, timeoutMs = 60_000): Promise<T> {
  if (!client) throw new Error('AI is not configured')
  const res = await client.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      maxOutputTokens,
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  })
  return JSON.parse(res.text ?? 'null') as T
}

export type PlannedPost = { angle: string; caption: string; hashtags: string[] }

// One coherent run of posts: each slot gets a distinct angle that moves the
// campaign forward (tease → launch → proof → reminder → last call …).
export async function generateCampaignPosts(
  brandName: string,
  brand: BrandKit | null,
  o: { brief: string; dates: string[]; tone: PostOptions['tone']; language: PostOptions['language'] },
): Promise<PlannedPost[]> {
  const system = [
    'You are a social media strategist planning one campaign for a brand. Never invent prices, dates, offers or facts beyond the brief and brand details.',
    brandContext(brandName, brand),
    `Tone: ${o.tone} — ${TONE_HINT[o.tone]}. Write in ${o.language}. Captions 300–600 characters, no hashtags inside captions.`,
    `Return JSON: an array of exactly ${o.dates.length} objects {"angle": short label, "caption": string, "hashtags": string[3-6 without #]}, in date order. Every post must have a different angle and build on the previous ones.`,
  ].join('\n\n')
  const prompt = `Campaign brief: ${o.brief}\n\nPublishing dates: ${o.dates.join(', ')}`
  const out = await json<PlannedPost[]>(system, prompt, Math.min(8000, 700 * o.dates.length + 500), 90_000)
  if (!Array.isArray(out) || out.length === 0) throw new Error('Empty campaign plan')
  return out.slice(0, o.dates.length).map((p) => ({
    angle: String(p.angle ?? '').slice(0, 120),
    caption: String(p.caption ?? '').trim(),
    hashtags: (p.hashtags ?? []).map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean).slice(0, 8),
  }))
}

export type BlogOutline = { title: string; summary: string; keywords: string[] }

export async function generateBlogOutlines(
  brandName: string,
  brand: BrandKit | null,
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
  brand: BrandKit | null,
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
