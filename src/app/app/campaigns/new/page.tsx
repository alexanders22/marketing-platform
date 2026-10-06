import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { CampaignWizard } from './CampaignWizard'

export const metadata: Metadata = { title: 'New campaign — Loudpilot' }

export default async function NewCampaignPage({ searchParams }: PageProps<'/app/campaigns/new'>) {
  const { account, brand, workspace } = await requireContext()
  const videos = await prisma.media.count({ where: { workspaceId: workspace.id, kind: 'VIDEO', NOT: { prompt: { startsWith: 'Video poster' } } } })
  const { kind, name, brief } = await searchParams
  return (
    <CampaignWizard
      kind={kind === 'blog' ? 'blog' : 'social'}
      credits={account.creditBalance}
      website={brand?.website ?? null}
      initialName={typeof name === 'string' ? name.slice(0, 120) : ''}
      initialBrief={typeof brief === 'string' ? brief.slice(0, 3000) : ''}
      videos={videos}
    />
  )
}
