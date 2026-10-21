'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/lib/context'
import { encrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'
import { safeFetchText } from '@/lib/safe-fetch'
import { cleanDomain, ensureSite, newSecret, siteSecret, STANDARD_EVENTS } from '@/lib/tag'

const manager = async () => {
  const ctx = await requireContext()
  if (ctx.role === 'EDITOR' && !ctx.asAdmin) throw new Error('Only the owner or an admin can change this.')
  return ctx
}

export type TagSettings = {
  domains: string
  consentRequired: boolean
  autoForms: boolean
  capi: boolean
  pixelId: string
  // Empty keeps the saved token; "-" removes it.
  capiToken: string
  capiEvents: string[]
  pixelMirror: boolean
}

export async function saveTagSettings(s: TagSettings): Promise<{ error?: string }> {
  let ctx
  try {
    ctx = await manager()
  } catch (e) {
    return { error: (e as Error).message }
  }
  const site = await ensureSite(ctx.workspace.id)
  const raw = s.domains.split(/[\s,]+/).filter(Boolean)
  const domains = [...new Set(raw.map(cleanDomain))]
  if (domains.includes(null)) return { error: `"${raw[domains.indexOf(null)]}" is not a domain. Write it like shop.ge.` }
  const pixelId = s.pixelId.trim()
  if (pixelId && !/^\d{8,20}$/.test(pixelId)) return { error: 'The pixel id is the number from Events Manager (15–16 digits).' }
  if (s.capi && !pixelId) return { error: 'Enter the pixel id to send conversions to Meta.' }
  const token = s.capiToken.trim()
  await prisma.site.update({
    where: { id: site.id },
    data: {
      domains: domains as string[],
      consentRequired: s.consentRequired,
      autoForms: s.autoForms,
      capi: s.capi,
      pixelId: pixelId || null,
      capiEvents: s.capiEvents.filter((e) => (STANDARD_EVENTS as readonly string[]).includes(e) && e !== 'PageView'),
      pixelMirror: s.pixelMirror,
      capiError: null,
      ...(token === '-' ? { capiTokenEnc: null } : token ? { capiTokenEnc: encrypt(token) } : {}),
    },
  })
  revalidatePath('/app/website/tag')
  return {}
}

export async function revealSecret(): Promise<{ secret?: string; error?: string }> {
  try {
    const ctx = await manager()
    return { secret: siteSecret(await ensureSite(ctx.workspace.id)) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// A new secret: the old one stops working at once (identity hashes, server
// events and data-endpoint signatures must switch to the new one).
export async function rotateSecret(): Promise<{ secret?: string; error?: string }> {
  try {
    const ctx = await manager()
    const site = await ensureSite(ctx.workspace.id)
    const secret = newSecret()
    await prisma.site.update({ where: { id: site.id }, data: { secretEnc: encrypt(secret) } })
    return { secret }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// Is the snippet in the home page? (Sites that add it through Google Tag
// Manager only show it once events arrive.)
export async function checkInstall(): Promise<{ ok?: boolean; message: string }> {
  const { workspace, brand } = await requireContext()
  const site = await ensureSite(workspace.id)
  if (!brand?.website) return { message: 'Add your website in Brand → Brand kit first.' }
  try {
    const { text, url } = await safeFetchText(/^https?:\/\//.test(brand.website) ? brand.website : `https://${brand.website}`, { timeoutMs: 10_000, maxBytes: 2_000_000 })
    if (text.includes(site.key)) return { ok: true, message: `Found on ${url}.` }
    if (/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/.test(text)) return { message: `Not in the page code of ${url}. If you added it through Google Tag Manager, publish the container and open the site — events will show up below.` }
    return { message: `Not found on ${url}. Paste the snippet into the <head> of every page.` }
  } catch (e) {
    return { message: `Could not open ${brand.website}: ${e instanceof Error ? e.message : 'error'}` }
  }
}
