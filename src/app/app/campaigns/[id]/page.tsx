import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { mediaUrl } from '@/lib/storage'
import { CampaignView } from './CampaignView'
import { campaignActuals } from '@/lib/actuals'

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
  // Video posts show their poster frame.
  const firsts = await prisma.media.findMany({ where: { id: { in: c.posts.flatMap((p) => p.mediaIds.slice(0, 1)) } }, select: { id: true, kind: true, posterId: true } })
  const thumb = (id: string | undefined) => {
    if (!id) return null
    const m = firsts.find((x) => x.id === id)
    return m?.kind === 'VIDEO' ? (m.posterId ? mediaUrl(m.posterId) : null) : mediaUrl(id)
  }
  const videos = await prisma.media.count({ where: { workspaceId: workspace.id, kind: 'VIDEO', NOT: { prompt: { startsWith: 'Video poster' } } } })
  // A job cut short by a restart counts as finished after half an hour.
  const generating = c.imageStatus === 'GENERATING' && c.updatedAt > minutesAgo(30)
  // Social campaigns: what was planned vs what the posts did.
  const comparison = c.kind === 'SOCIAL' && c.posts.length ? await campaignActuals(c) : null
  return (
    <CampaignView
      comparison={comparison}
      images={{ generating, done: c.imagesDone, total: c.imagesTotal }}
      imagesError={typeof q.images === 'string' ? q.images : undefined}
      videos={videos}
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
        image: thumb(p.mediaIds[0]),
        hasMedia: p.mediaIds.length > 0,
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
      }))}
    />
  )
}
