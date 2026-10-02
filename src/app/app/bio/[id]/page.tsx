import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { BioBlock, BioTheme, themePresets } from '@/lib/bio'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { mediaUrl } from '@/lib/storage'
import { BioEditor } from './BioEditor'

export const metadata: Metadata = { title: 'Edit bio page — Khma' }

export default async function EditBioPage({ params }: PageProps<'/app/bio/[id]'>) {
  const { workspace, brand } = await requireContext()
  const { id } = await params
  const p = await prisma.bioPage.findFirst({ where: { id, workspaceId: workspace.id } })
  if (!p) notFound()
  const clicks = await prisma.bioClick.groupBy({ by: ['blockId'], where: { pageId: p.id }, _count: { _all: true } })
  const presets = themePresets(brand?.colors ?? [])
  return (
    <BioEditor
      presets={presets}
      initial={{
        id: p.id,
        slug: p.slug,
        title: p.title,
        bio: p.bio,
        avatar: p.avatarMediaId ? { id: p.avatarMediaId, url: mediaUrl(p.avatarMediaId) } : null,
        theme: BioTheme.safeParse(p.theme).data ?? presets[0].theme,
        blocks: z.array(BioBlock).safeParse(p.blocks).data ?? [],
        published: p.published,
      }}
      stats={{ views: p.views, clicks: Object.fromEntries(clicks.map((c) => [c.blockId, c._count._all])) }}
    />
  )
}
