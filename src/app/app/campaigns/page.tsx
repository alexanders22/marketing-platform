import type { Metadata } from 'next'
import { Target } from 'lucide-react'
import { EmptyState, PageHeader, SoonButton } from '@/components/EmptyState'

export const metadata: Metadata = { title: 'Campaigns — Khma' }

export default function CampaignsPage() {
  return (
    <>
      <PageHeader
        title="Campaigns"
        sub="Plan a series of posts and ads around one goal — a launch, a sale, an event."
        action={<SoonButton>New campaign</SoonButton>}
      />
      <EmptyState icon={Target} title="No campaigns yet">
        Describe your goal once and Khma will plan the posts, visuals and ads across the weeks you choose.
      </EmptyState>
    </>
  )
}
