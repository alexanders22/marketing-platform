import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { mediaUrl } from '@/lib/storage'
import { BlogEditor } from '../BlogEditor'

export const metadata: Metadata = { title: 'Edit article — Khma' }

export default async function EditBlogPage({ params }: PageProps<'/app/blog/[id]'>) {
  const { workspace } = await requireContext()
  const { id } = await params
  const post = await prisma.post.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { campaign: { select: { id: true, name: true } } },
  })
  if (!post) notFound()
  if (post.kind !== 'BLOG') redirect(`/app/posts/${post.id}`)
  return (
    <BlogEditor
      key={post.updatedAt.toISOString()}
      initial={{
        id: post.id,
        title: post.title ?? '',
        content: post.content,
        outline: post.outline,
        keywords: post.hashtags,
        cover: post.mediaIds[0] ? { id: post.mediaIds[0], url: mediaUrl(post.mediaIds[0]) } : null,
        scheduledAt: post.scheduledAt?.toISOString() ?? null,
        aiGenerated: post.aiGenerated,
        campaign: post.campaign,
      }}
    />
  )
}
