import 'server-only'
import { GoogleGenAI } from '@google/genai'
import type { BrandKit } from '@prisma/client'

// GEMINI_API_KEY enables generation; GEMINI_MODEL overrides the model.
const key = process.env.GEMINI_API_KEY
const client = key ? new GoogleGenAI({ apiKey: key }) : null
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'

export const aiEnabled = () => client !== null

export type PostOptions = {
  prompt: string
  tone: string
  length: 'Short' | 'Medium' | 'Long'
  hashtags: boolean
  language: string
}

export type GeneratedPost = { caption: string; hashtags: string[] }

const LENGTH = { Short: 'under 200 characters', Medium: '300–600 characters', Long: '800–1300 characters' }

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
    'You write social media posts for one brand. Stay strictly on brand and never invent prices, dates, offers or facts that are not in the request or the brand details.',
    brandContext(brandName, brand),
    `Tone: ${o.tone}. Length: ${LENGTH[o.length]}. Write in ${o.language}.`,
    o.hashtags ? 'Add 3–6 relevant hashtags in the "hashtags" array (without #).' : 'Return an empty "hashtags" array.',
    'Return JSON: {"caption": string, "hashtags": string[]}. The caption must not contain the hashtags.',
  ].join('\n\n')

  const res = await client.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: o.prompt }] }],
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      maxOutputTokens: 1200,
      abortSignal: AbortSignal.timeout(30_000),
    },
  })
  const parsed = JSON.parse(res.text ?? '{}') as Partial<GeneratedPost>
  if (!parsed.caption) throw new Error('Empty AI response')
  return {
    caption: String(parsed.caption).trim(),
    hashtags: (parsed.hashtags ?? []).map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean).slice(0, 8),
  }
}
