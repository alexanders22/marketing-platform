'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { BioBlock, BioTheme, bioUid, Slug, themePresets } from '@/lib/bio'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'

export async function createBioPage(): Promise<{ id: string }> {
  const { workspace, brand } = await requireContext()
  // A readable, unique starting address from the brand name.
  const base =
    workspace.name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'page'
  let slug = base.length >= 3 ? base : `${base}-page`
  for (let i = 2; await prisma.bioPage.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`

  const blocks: BioBlock[] = [
    ...(brand?.website ? [{ id: bioUid(), type: 'link' as const, title: 'Visit our website', url: brand.website, enabled: true }] : []),
    ...(brand?.socialLinks.length ? [{ id: bioUid(), type: 'socials' as const, links: brand.socialLinks.slice(0, 10), enabled: true }] : []),
  ]
  const page = await prisma.bioPage.create({
    data: {
      workspaceId: workspace.id,
      slug,
      title: workspace.name,
      bio: brand?.description?.slice(0, 160) ?? '',
      theme: themePresets(brand?.colors ?? [])[0].theme as Prisma.InputJsonValue,
      blocks: blocks as unknown as Prisma.InputJsonValue,
    },
  })
  revalidatePath('/app/bio')
  return { id: page.id }
}

const Save = z.object({
  id: z.string(),
  slug: Slug,
  title: z.string().trim().min(1, 'Add a title').max(80),
  bio: z.string().trim().max(300),
  avatarMediaId: z.string().nullable(),
  theme: BioTheme,
  blocks: z.array(BioBlock).max(50),
  published: z.boolean(),
})

export async function saveBioPage(raw: z.input<typeof Save>): Promise<{ error?: string }> {
  const { workspace } = await requireContext()
  const parsed = Save.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const p = parsed.data

  if (p.avatarMediaId && !(await prisma.media.findFirst({ where: { id: p.avatarMediaId, workspaceId: workspace.id }, select: { id: true } }))) {
    return { error: 'Avatar image not found' }
  }
  const taken = await prisma.bioPage.findUnique({ where: { slug: p.slug }, select: { id: true } })
  if (taken && taken.id !== p.id) return { error: 'This address is already taken' }

  const res = await prisma.bioPage.updateMany({
    where: { id: p.id, workspaceId: workspace.id },
    data: {
      slug: p.slug,
      title: p.title,
      bio: p.bio,
      avatarMediaId: p.avatarMediaId,
      theme: p.theme as Prisma.InputJsonValue,
      blocks: p.blocks as unknown as Prisma.InputJsonValue,
      published: p.published,
    },
  })
  if (res.count === 0) return { error: 'Page not found' }
  revalidatePath('/app/bio')
  revalidatePath(`/b/${p.slug}`)
  return {}
}

export async function deleteBioPage(id: string) {
  const { workspace } = await requireContext()
  await prisma.bioPage.deleteMany({ where: { id, workspaceId: workspace.id } })
  revalidatePath('/app/bio')
  return {}
}
