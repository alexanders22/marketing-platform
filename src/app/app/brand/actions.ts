'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { BrandInput, type BrandDraft } from '@/lib/brand-schema'

export async function saveBrand(draft: BrandDraft): Promise<{ error?: string }> {
  const { workspace } = await requireContext()
  const parsed = BrandInput.safeParse({
    ...draft,
    socialLinks: draft.socialLinks.map((l) => l.trim()).filter((l) => l && l !== 'https://'),
    fonts: (draft.fonts ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { name, ...b } = parsed.data
  const data = {
    website: b.website,
    description: b.description,
    logoUrl: b.logoUrl,
    colors: b.colors,
    socialLinks: b.socialLinks,
    voice: b.voice ?? null,
    audience: b.audience ?? null,
    fonts: b.fonts ?? [],
  }

  await prisma.$transaction([
    prisma.workspace.update({ where: { id: workspace.id }, data: { name } }),
    prisma.brandKit.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, ...data },
      update: data,
    }),
  ])
  revalidatePath('/app', 'layout')
  return {}
}
