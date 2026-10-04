import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireContext } from '@/lib/context'
import type { DesignDoc } from '@/lib/design'
import { prisma } from '@/lib/prisma'
import { Editor } from './Editor'

export const metadata: Metadata = { title: 'Studio — Loudpilot' }

export default async function DesignPage({ params, searchParams }: PageProps<'/app/studio/[id]'>) {
  const { workspace, brand } = await requireContext()
  const { id } = await params
  const d = await prisma.design.findFirst({ where: { id, workspaceId: workspace.id } })
  if (!d) notFound()
  // Opened from a post: "Use in post" goes back into it.
  const sp = await searchParams
  const postId = typeof sp.post === 'string' ? sp.post : null
  const post = postId ? await prisma.post.findFirst({ where: { id: postId, workspaceId: workspace.id }, select: { id: true } }) : null
  const replace = typeof sp.replace === 'string' ? sp.replace : undefined
  return (
    <Editor
      design={{ id: d.id, name: d.name, width: d.width, height: d.height, data: d.data as unknown as DesignDoc }}
      brand={{ name: workspace.name, colors: brand?.colors ?? [], logoUrl: brand?.logoUrl ?? null }}
      forPost={post ? { postId: post.id, replaceMediaId: replace } : undefined}
    />
  )
}
