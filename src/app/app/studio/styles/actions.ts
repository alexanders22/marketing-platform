'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { aiEnabled, generateImage } from '@/lib/ai'
import { aiError } from '@/lib/ai-health'
import { requireContext } from '@/lib/context'
import { charge, notEnough, prices } from '@/lib/credits'
import { withDossier } from '@/lib/dossier'
import { prisma } from '@/lib/prisma'
import { mediaUrl, saveMedia } from '@/lib/storage'
import { copyStyle, listStyles, RefError, resolveImageStyle, type StyleKind, type StyleView } from '@/lib/style-ref'

// Copied styles: read a reference (link or library file), list, delete, and
// make new images in a copied look.

const CopyInput = z.object({
  kind: z.enum(['IMAGE', 'VIDEO']),
  url: z.string().trim().max(2000).optional(),
  mediaId: z.string().max(40).optional(),
})

export async function copyStyleFrom(raw: z.input<typeof CopyInput>): Promise<{ style?: StyleView; error?: string }> {
  const { account, workspace } = await requireContext()
  const parsed = CopyInput.safeParse(raw)
  if (!parsed.success || (!parsed.data.url && !parsed.data.mediaId)) return { error: 'Add a link or a file' }
  const { kind, url, mediaId } = parsed.data
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  const COST = await prices()
  const cost = kind === 'VIDEO' ? COST.styleVideo : COST.styleImage
  if (account.creditBalance < cost) return { error: notEnough(cost, account.creditBalance) }
  let style: StyleView
  try {
    style = await copyStyle(workspace.id, kind, { url: url || undefined, mediaId })
  } catch (e) {
    if (e instanceof RefError) return { error: e.message }
    console.error('copy style failed', e)
    return { error: aiError(e, 'The AI could not read this style. Try another one.') }
  }
  const ok = await charge(account.id, workspace.id, [
    { amount: cost, reason: 'AI_TEXT', note: `Style copied: ${style.name}`, action: kind === 'VIDEO' ? 'styleVideo' : 'styleImage', units: 1 },
  ])
  if (!ok) {
    await prisma.styleRef.delete({ where: { id: style.id } })
    return { error: notEnough(cost, 0) }
  }
  revalidatePath('/app', 'layout')
  return { style }
}

export async function myStyles(kind?: StyleKind): Promise<StyleView[]> {
  const { workspace } = await requireContext()
  return listStyles(workspace.id, kind === 'IMAGE' || kind === 'VIDEO' ? kind : undefined)
}

export async function deleteStyle(id: string) {
  const { workspace } = await requireContext()
  await prisma.styleRef.deleteMany({ where: { id: String(id), workspaceId: workspace.id } })
  revalidatePath('/app/studio')
}

const ImagesInput = z.object({
  styleId: z.string().max(60),
  brief: z.string().trim().min(3, 'Describe the picture').max(1000),
  count: z.number().int().min(1).max(4),
  aspect: z.enum(['1:1', '4:5', '9:16', '16:9']),
})

// New images in a copied (or built-in) look, into the library. Each image
// delivered costs COST.image; failed ones are free.
export async function imagesInStyle(raw: z.input<typeof ImagesInput>): Promise<{ images?: { id: string; url: string }[]; error?: string }> {
  const { account, workspace, brand } = await requireContext()
  const parsed = ImagesInput.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const input = parsed.data
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  const COST = await prices()
  if (account.creditBalance < input.count * COST.image) return { error: notEnough(input.count * COST.image, account.creditBalance) }
  const style = await resolveImageStyle(workspace.id, input.styleId)
  if (!style) return { error: 'Style not found' }
  const known = await withDossier(brand, workspace.id)
  const res = await Promise.allSettled(
    Array.from({ length: input.count }, (_, i) =>
      generateImage(workspace.name, known, input.brief, input.brief, i, [], input.aspect, style).then((img) => saveMedia(workspace.id, img.data, img.mime, `${input.brief} · ${style.label}`)),
    ),
  )
  const made = res.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  res.forEach((r) => r.status === 'rejected' && console.error('styled image failed', r.reason))
  if (!made.length) return { error: aiError(res.find((r) => r.status === 'rejected')?.reason, 'The images could not be made. Try again.') }
  const ok = await charge(account.id, workspace.id, [
    { amount: made.length * COST.image, reason: 'AI_IMAGE', note: `${made.length} image${made.length === 1 ? '' : 's'} · ${style.label}`, action: 'image', units: made.length },
  ])
  if (!ok) return { error: notEnough(made.length * COST.image, 0) }
  revalidatePath('/app', 'layout')
  return { images: made.map((m) => ({ id: m.id, url: mediaUrl(m.id) })) }
}
