import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { Composer } from './Composer'

export const metadata: Metadata = { title: 'Create — Loudpilot' }

export default async function CreatePage() {
  const { account, workspace } = await requireContext()
  const libraries = await prisma.hashtagLibrary.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, tags: true },
  })
  return <Composer credits={account.creditBalance} libraries={libraries} />
}
