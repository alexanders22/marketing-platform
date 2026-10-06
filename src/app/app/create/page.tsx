import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { Composer } from './Composer'

export const metadata: Metadata = { title: 'Create — Loudpilot' }

export default async function CreatePage({ searchParams }: PageProps<'/app/create'>) {
  const { account, workspace } = await requireContext()
  const libraries = await prisma.hashtagLibrary.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, tags: true },
  })
  // ?prompt= from a suggestion elsewhere (competitors, weekly review…).
  const { prompt } = await searchParams
  return <Composer credits={account.creditBalance} libraries={libraries} initialPrompt={typeof prompt === 'string' ? prompt.slice(0, 2000) : ''} />
}
