import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { CampaignWizard } from './CampaignWizard'

export const metadata: Metadata = { title: 'New campaign — Loudpilot' }

export default async function NewCampaignPage({ searchParams }: PageProps<'/app/campaigns/new'>) {
  const { account, brand } = await requireContext()
  const { kind } = await searchParams
  return <CampaignWizard kind={kind === 'blog' ? 'blog' : 'social'} credits={account.creditBalance} website={brand?.website ?? null} />
}
