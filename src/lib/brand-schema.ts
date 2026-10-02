import { z } from 'zod'

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)

const url = text(500).refine((v) => !v || /^https?:\/\/\S+\.\S+/.test(v), 'Links must start with http:// or https://')

// Shared by onboarding and the brand settings page.
export const BrandInput = z.object({
  name: z.string().trim().min(1, 'Brand name is required').max(120),
  website: url,
  description: text(2000),
  logoUrl: url,
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colours must be hex like #FF6000')).max(8),
  socialLinks: z
    .array(z.string().trim().regex(/^https?:\/\/\S+\.\S+/, 'Social links must be full URLs'))
    .max(12),
  voice: text(500).optional(),
  audience: text(1000).optional(),
  fonts: z.array(z.string().trim().min(1).max(60)).max(4).optional(),
})

export type BrandInput = z.infer<typeof BrandInput>

export type BrandDraft = {
  name: string
  website: string
  description: string
  logoUrl: string
  colors: string[]
  socialLinks: string[]
  voice?: string
  audience?: string
  fonts?: string
}
