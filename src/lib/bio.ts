import { z } from 'zod'

// Link-in-bio content model, shared by the editor, server validation and the
// public page.

const safeUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => /^(https?:\/\/\S+\.\S+|mailto:\S+@\S+|tel:\+?[\d\s()-]{5,})$/i.test(u), 'Links must start with https://, mailto: or tel:')

export const BioBlock = z.discriminatedUnion('type', [
  z.object({ id: z.string().max(20), type: z.literal('link'), title: z.string().trim().min(1, 'Every link needs a title').max(80), url: safeUrl, enabled: z.boolean() }),
  z.object({ id: z.string().max(20), type: z.literal('heading'), text: z.string().trim().min(1).max(80), enabled: z.boolean() }),
  z.object({ id: z.string().max(20), type: z.literal('text'), text: z.string().trim().min(1).max(500), enabled: z.boolean() }),
  z.object({ id: z.string().max(20), type: z.literal('socials'), links: z.array(safeUrl).max(10), enabled: z.boolean() }),
])
export type BioBlock = z.infer<typeof BioBlock>

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)
export const BioTheme = z.object({
  background: hex,
  text: hex,
  button: hex,
  buttonText: hex,
  buttonStyle: z.enum(['filled', 'outline', 'soft']),
  rounded: z.enum(['none', 'md', 'full']),
})
export type BioTheme = z.infer<typeof BioTheme>

export const RESERVED_SLUGS = ['app', 'admin', 'api', 'login', 'signup', 'khma', 'b', 'media', 'auth', 'support', 'help']
export const Slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'Use 3–40 letters, digits or dashes')
  .refine((s) => !RESERVED_SLUGS.includes(s), 'This address is reserved')

export function themePresets(colors: string[]): { name: string; theme: BioTheme }[] {
  const p = colors[0] ?? '#FF6000'
  const s = colors[1] ?? '#7C3AED'
  return [
    { name: 'Brand', theme: { background: p, text: '#FFFFFF', button: '#FFFFFF', buttonText: '#111111', buttonStyle: 'filled', rounded: 'full' } },
    { name: 'Light', theme: { background: '#F7F7F5', text: '#111111', button: p, buttonText: '#FFFFFF', buttonStyle: 'filled', rounded: 'md' } },
    { name: 'Dark', theme: { background: '#111111', text: '#FFFFFF', button: '#FFFFFF', buttonText: '#111111', buttonStyle: 'outline', rounded: 'md' } },
    { name: 'Accent', theme: { background: s, text: '#FFFFFF', button: '#FFFFFF', buttonText: s, buttonStyle: 'soft', rounded: 'full' } },
  ]
}

export const bioUid = () => Math.random().toString(36).slice(2, 10)
