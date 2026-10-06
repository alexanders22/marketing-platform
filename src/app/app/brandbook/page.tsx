import type { Metadata } from 'next'
import type { BrandbookData } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { BrandbookView } from './BrandbookView'

export const metadata: Metadata = { title: 'Brandbook — Loudpilot' }

export default async function BrandbookPage() {
  const { workspace, brand } = await requireContext()
  const book = await prisma.brandbook.findUnique({ where: { workspaceId: workspace.id } })
  return (
    <BrandbookView
      brand={workspace.name}
      logoUrl={brand?.logoUrl ?? null}
      audience={brand?.audience ?? ''}
      book={book ? { data: book.data as unknown as BrandbookData, source: book.source, updatedAt: book.updatedAt.toISOString() } : null}
    />
  )
}
