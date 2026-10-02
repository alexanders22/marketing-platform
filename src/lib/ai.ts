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
