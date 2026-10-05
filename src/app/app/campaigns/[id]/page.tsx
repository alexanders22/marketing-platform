import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { mediaUrl } from '@/lib/storage'
import { CampaignView } from './CampaignView'

// Outside the component: render functions must stay pure.
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000)

export const metadata: Metadata = { title: 'Campaign — Loudpilot' }

export default async function CampaignPage({ params, searchParams }: PageProps<'/app/campaigns/[id]'>) {
  const { workspace } = await requireContext()
  const { id } = await params
  const c = await prisma.campaign.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { posts: { orderBy: { scheduledAt: 'asc' } } },
  })
  if (!c) notFound()
  const q = await searchParams
  // A job cut short by a restart counts as finished after half an hour.
  const generating = c.imageStatus === 'GENERATING' && c.updatedAt > minutesAgo(30)
  return (
    <CampaignView
      images={{ generating, done: c.imagesDone, total: c.imagesTotal }}
      imagesError={typeof q.images === 'string' ? q.images : undefined}
      campaign={{
        id: c.id,
        kind: c.kind,
        name: c.name,
        brief: c.brief,
        startsOn: c.startsOn.toISOString(),
        endsOn: c.endsOn.toISOString(),
        tone: c.tone,
        language: c.language,
      }}
      posts={c.posts.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        outline: p.outline,
        hashtags: p.hashtags,
        channels: p.channels,
        image: p.mediaIds[0] ? mediaUrl(p.mediaIds[0]) : null,
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
      }))}
    />
  )
}
