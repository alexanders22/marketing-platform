import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { isPaid } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { mediaUrl } from '@/lib/storage'
import { Characters } from './Characters'

export const metadata: Metadata = { title: 'Characters — Loudpilot Studio' }

export default async function CharactersPage() {
  const { workspace, account, user } = await requireContext()
  const list = await prisma.character.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'desc' } })
  return (
    <Characters
      paid={isPaid(account) || user.role === 'SUPER_ADMIN'}
      characters={list.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        person: c.consentAt !== null,
        photos: c.photoIds.map((id) => ({ id, url: mediaUrl(id) })),
      }))}
    />
  )
}
