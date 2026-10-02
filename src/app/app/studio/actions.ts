'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { requireContext } from '@/lib/context'
import { palette, SIZES, TEMPLATES, resizeDoc } from '@/lib/design'
import { prisma } from '@/lib/prisma'
import { mediaUrl, saveMedia } from '@/lib/storage'

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const num = z.number().finite().min(-20000).max(20000)
const size = z.number().finite().min(1).max(20000)
const common = { id: z.string().max(40), name: z.string().max(80), x: num, y: num, w: size, h: size, rotation: z.number().min(-360).max(360) }

const Layer = z.discriminatedUnion('type', [
  z.object({
    ...common,
    type: z.literal('text'),
    text: z.string().max(2000),
    fontSize: z.number().min(4).max(800),
    fontWeight: z.union([z.literal(400), z.literal(600), z.literal(800)]),
    fontFamily: z.string().max(60),
    color,
    align: z.enum(['left', 'center', 'right']),
    lineHeight: z.number().min(0.5).max(3),
  }),
  z.object({
    ...common,
    type: z.literal('shape'),
    shape: z.enum(['rect', 'ellipse']),
    fill: color,
    radius: z.number().min(0).max(5000),
    opacity: z.number().min(0).max(1),
  }),
  z.object({
    ...common,
    type: z.literal('image'),
    mediaId: z.string().max(40),
    // Only our own media endpoint — never arbitrary URLs.
    src: z.string().regex(/^\/media\/[a-z0-9]+$/),
    fit: z.enum(['cover', 'contain']),
    radius: z.number().min(0).max(5000),
    opacity: z.number().min(0).max(1),
  }),
])

const Doc = z.object({ background: color, layers: z.array(Layer).max(200) })

const SaveInput = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(120),
  width: z.number().int().min(100).max(4000),
  height: z.number().int().min(100).max(4000),
  data: Doc,
})

export async function createDesign(sizeId: string, templateId: string) {
  const { workspace, brand } = await requireContext()
  const size = SIZES.find((s) => s.id === sizeId) ?? SIZES[0]
  const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[TEMPLATES.length - 1]
  const doc = resizeDoc(tpl.build(palette(brand?.colors ?? []), workspace.name), { w: 1080, h: 1080 }, size)
  const design = await prisma.design.create({
    data: {
      workspaceId: workspace.id,
      name: tpl.id === 'blank' ? `Untitled ${size.name}` : `${tpl.name} · ${size.name}`,
      width: size.w,
      height: size.h,
      data: doc as unknown as Prisma.InputJsonValue,
    },
  })
  revalidatePath('/app/studio')
  return { id: design.id }
}

export async function saveDesign(raw: z.input<typeof SaveInput>): Promise<{ error?: string }> {
  const { workspace } = await requireContext()
  const parsed = SaveInput.safeParse(raw)
  if (!parsed.success) return { error: 'This design has invalid content' }
  const d = parsed.data

  // Image layers may only point at this workspace's media.
  const ids = [...new Set(d.data.layers.flatMap((l) => (l.type === 'image' ? [l.mediaId] : [])))]
  if (ids.length && (await prisma.media.count({ where: { id: { in: ids }, workspaceId: workspace.id } })) !== ids.length) {
    return { error: 'Some images are not available' }
  }
  if (d.data.layers.some((l) => l.type === 'image' && l.src !== mediaUrl(l.mediaId))) return { error: 'Invalid image' }

  const res = await prisma.design.updateMany({
    where: { id: d.id, workspaceId: workspace.id },
    // The exported thumbnail no longer matches after an edit — fall back to the live preview.
    data: { name: d.name, width: d.width, height: d.height, data: d.data as unknown as Prisma.InputJsonValue, previewMediaId: null },
  })
  if (res.count === 0) return { error: 'Design not found' }
  revalidatePath('/app/studio')
  return {}
}

// Stores the rendered PNG as media; optionally opens it as a new post draft.
export async function exportDesign(
  id: string,
  png: string,
  asPost: boolean,
): Promise<{ mediaId?: string; url?: string; postId?: string; error?: string }> {
  const { workspace, user } = await requireContext()
  const design = await prisma.design.findFirst({ where: { id, workspaceId: workspace.id } })
  if (!design) return { error: 'Design not found' }
  const buf = Buffer.from(png, 'base64')
  if (buf.length === 0 || buf.length > 15 * 1024 * 1024) return { error: 'Export is too large' }
  if (!buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { error: 'Invalid image' }

  const media = await saveMedia(workspace.id, buf, 'image/png', `Studio: ${design.name}`)
  await prisma.design.update({ where: { id }, data: { previewMediaId: media.id } })

  let postId: string | undefined
  if (asPost) {
    const post = await prisma.post.create({
      data: { workspaceId: workspace.id, kind: 'SOCIAL', content: '', mediaIds: [media.id], createdById: user.id },
    })
    postId = post.id
  }
  revalidatePath('/app', 'layout')
  return { mediaId: media.id, url: mediaUrl(media.id), postId }
}

export async function deleteDesign(id: string) {
  const { workspace } = await requireContext()
  await prisma.design.deleteMany({ where: { id, workspaceId: workspace.id } })
  revalidatePath('/app/studio')
  return {}
}

export async function duplicateDesign(id: string) {
  const { workspace } = await requireContext()
  const d = await prisma.design.findFirst({ where: { id, workspaceId: workspace.id } })
  if (!d) return { error: 'Design not found' }
  const copy = await prisma.design.create({
    data: { workspaceId: workspace.id, name: `${d.name.slice(0, 113)} (copy)`, width: d.width, height: d.height, data: d.data as Prisma.InputJsonValue },
  })
  revalidatePath('/app/studio')
  return { id: copy.id }
}
