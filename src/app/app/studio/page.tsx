import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import type { DesignDoc } from '@/lib/design'
import { prisma } from '@/lib/prisma'
import { mediaUrl } from '@/lib/storage'
import { StudioHome } from './StudioHome'

export const metadata: Metadata = { title: 'Studio — Loudpilot' }

export default async function StudioPage() {
  const { workspace, brand } = await requireContext()
  const designs = await prisma.design.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: 'desc' },
    take: 60,
  })
  return (
    <StudioHome
      brandName={workspace.name}
      colors={brand?.colors ?? []}
      designs={designs.map((d) => ({
        id: d.id,
        name: d.name,
        width: d.width,
        height: d.height,
        data: d.data as unknown as DesignDoc,
        preview: d.previewMediaId ? mediaUrl(d.previewMediaId) : null,
        updatedAt: d.updatedAt.toISOString(),
      }))}
    />
  )
}
