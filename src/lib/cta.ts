import { z } from 'zod'

// Call to action at the end of a post. Shared by the editor (client), the
// validation and the publisher. Links get UTM tags per network at publish
// time, so Google Analytics shows which post and network brought a visitor.

export const CTA_TYPES = {
  LEARN_MORE: { label: 'Learn more', needs: 'url', emoji: '👉' },
  SIGN_UP: { label: 'Sign up', needs: 'url', emoji: '👉' },
  BOOK: { label: 'Book now', needs: 'url', emoji: '📅' },
  SHOP: { label: 'Shop now', needs: 'url', emoji: '🛍️' },
  GET_QUOTE: { label: 'Get a quote', needs: 'url', emoji: '👉' },
  CALL: { label: 'Call us', needs: 'phone', emoji: '📞' },
  WHATSAPP: { label: 'WhatsApp us', needs: 'phone', emoji: '💬' },
  MESSAGE: { label: 'Send us a message', needs: 'none', emoji: '✉️' },
} as const
export type CtaType = keyof typeof CTA_TYPES
export const CTA_IDS = Object.keys(CTA_TYPES) as CtaType[]

export type Cta = { type: CtaType; url?: string | null; phone?: string | null }

export const CtaInput = z
  .object({
    type: z.enum(CTA_IDS as [CtaType, ...CtaType[]]),
    url: z.url({ protocol: /^https?$/, error: 'Enter a link starting with https://' }).max(500).nullable().optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{6,20}$/, 'Enter a phone number, e.g. +995 555 12 34 56')
      .nullable()
      .optional(),
  })
  .refine((c) => CTA_TYPES[c.type].needs !== 'url' || !!c.url, { message: 'Add the link for the button', path: ['url'] })
  .refine((c) => CTA_TYPES[c.type].needs !== 'phone' || !!c.phone, { message: 'Add the phone number', path: ['phone'] })

export const readCta = (v: unknown): Cta | null => {
  const r = CtaInput.safeParse(v)
  return r.success ? r.data : null
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'post'

// utm_campaign for a Loudpilot campaign (also how its visits are found in GA).
export const utmCampaign = (name: string | null | undefined) => (name ? slug(name) : 'loudpilot')

// The link with UTM tags, keeping any the author already set.
export function withUtm(url: string, network: string, ctx: { campaign?: string | null; postId?: string | null }) {
  try {
    const u = new URL(url)
    const set = (k: string, v: string) => !u.searchParams.has(k) && u.searchParams.set(k, v)
    set('utm_source', network.toLowerCase())
    set('utm_medium', 'social')
    set('utm_campaign', utmCampaign(ctx.campaign))
    if (ctx.postId) set('utm_content', ctx.postId)
    return u.toString()
  } catch {
    return url
  }
}

// The closing line for one network. Instagram captions can't hold links, so
// they point to the link in the profile instead.
export function ctaLine(cta: Cta | null, network: string, ctx: { campaign?: string | null; postId?: string | null } = {}) {
  if (!cta) return ''
  const t = CTA_TYPES[cta.type]
  const ig = network === 'INSTAGRAM'
  if (t.needs === 'url' && cta.url) return ig ? `${t.emoji} ${t.label} — link in bio` : `${t.emoji} ${t.label}: ${withUtm(cta.url, network, ctx)}`
  if (cta.type === 'WHATSAPP' && cta.phone) {
    const digits = cta.phone.replace(/\D/g, '')
    return ig ? `${t.emoji} WhatsApp: ${cta.phone}` : `${t.emoji} ${t.label}: https://wa.me/${digits}`
  }
  if (cta.type === 'CALL' && cta.phone) return `${t.emoji} ${t.label}: ${cta.phone}`
  return `${t.emoji} ${t.label}`
}
