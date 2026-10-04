import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import type { Network } from '@/components/channels'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { PUBLISHABLE } from '@/lib/publisher'
import { mediaUrl } from '@/lib/storage'
import { PostEditor } from '../PostEditor'

export const metadata: Metadata = { title: 'Edit post — Loudpilot' }

export default async function EditPostPage({ params }: PageProps<'/app/posts/[id]'>) {
  const { workspace, brand } = await requireContext()
  const { id } = await params
  const post = await prisma.post.findFirst({
    where: { id, workspaceId: workspace.id },
    include: {
      campaign: { select: { id: true, name: true } },
      deliveries: { include: { socialAccount: { select: { network: true, name: true } } }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!post) notFound()
  if (post.kind === 'BLOG') redirect(`/app/blog/${post.id}`)
  const media = await prisma.media.findMany({ where: { id: { in: post.mediaIds }, workspaceId: workspace.id }, select: { id: true, kind: true, posterId: true } })
  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId: workspace.id, network: { in: [...PUBLISHABLE] }, status: 'ACTIVE' },
    select: { network: true },
  })
  return (
    <PostEditor
      brand={{ name: workspace.name, logoUrl: brand?.logoUrl ?? null }}
      initial={{
        id: post.id,
        content: post.content,
        hashtags: post.hashtags,
        media: post.mediaIds.map((m) => {
          const row = media.find((x) => x.id === m)
          return row?.kind === 'VIDEO'
            ? { id: m, url: mediaUrl(m), kind: 'video' as const, poster: row.posterId ? mediaUrl(row.posterId) : null }
            : { id: m, url: mediaUrl(m), kind: 'image' as const }
        }),
        channels: post.channels as Network[],
        scheduledAt: post.scheduledAt?.toISOString() ?? null,
        aiGenerated: post.aiGenerated,
        campaign: post.campaign,
        status: post.status,
      }}
      connected={[...new Set(accounts.map((a) => a.network))] as Network[]}
      deliveries={post.deliveries.map((d) => ({
        id: d.id,
        network: d.socialAccount.network as Network,
        account: d.socialAccount.name,
        status: d.status,
        permalink: d.permalink,
        error: d.error,
        metrics: (d.metrics ?? null) as Record<string, number> | null,
      }))}
    />
  )
}
