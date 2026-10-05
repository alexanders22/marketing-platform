import type { Metadata } from 'next'
import Link from 'next/link'
import { requireContext } from '@/lib/context'
import type { DesignDoc } from '@/lib/design'
import { prisma } from '@/lib/prisma'
import { mediaUrl } from '@/lib/storage'
import { StudioHome } from './StudioHome'
import { isPaid } from '@/lib/plans'
import { timeline, type VideoDoc } from '@/lib/video'
import { VideoSection } from './video/VideoSection'

export const metadata: Metadata = { title: 'Studio — Loudpilot' }

export default async function StudioPage({ searchParams }: PageProps<'/app/studio'>) {
  const { workspace, brand, account, user } = await requireContext()
  const designs = await prisma.design.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: 'desc' },
    take: 60,
  })
  const videos = await prisma.video.findMany({ where: { workspaceId: workspace.id }, orderBy: { updatedAt: 'desc' }, take: 60 })
  const outputs = await prisma.media.findMany({
    where: { id: { in: videos.flatMap((v) => (v.outputMediaId ? [v.outputMediaId] : [])) } },
    select: { id: true, posterId: true },
  })
  const posterOf = (v: (typeof videos)[number]) => {
    const out = outputs.find((o) => o.id === v.outputMediaId)
    if (out?.posterId) return mediaUrl(out.posterId)
    const first = (v.data as unknown as VideoDoc).scenes[0]?.media
    return first ? (first.kind === 'video' ? first.posterUrl : first.url) : null
  }
  const sp = await searchParams
  const post =
    typeof sp.post === 'string' ? await prisma.post.findFirst({ where: { id: sp.post, workspaceId: workspace.id }, select: { id: true } }) : null
  const tab = sp.tab === 'video' && !post ? 'video' : 'images'
  return (
    <>
      {!post && (
        <nav aria-label="Studio" className="mb-5 flex w-fit rounded-lg bg-zinc-100 p-1 text-sm">
          {(
            [
              ['images', 'Images', '/app/studio'],
              ['video', 'Video', '/app/studio?tab=video'],
            ] as const
          ).map(([id, label, href]) => (
            <Link key={id} href={href} aria-current={tab === id ? 'page' : undefined} className={`rounded-md px-4 py-1.5 font-medium ${tab === id ? 'bg-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}>
              {label}
            </Link>
          ))}
        </nav>
      )}
      {tab === 'images' && (
      <StudioHome
        brandName={workspace.name}
        colors={brand?.colors ?? []}
        forPost={post?.id}
        designs={designs.map((d) => ({
          id: d.id,
          name: d.name,
          width: d.width,
          height: d.height,
          data: d.data as unknown as DesignDoc,
          preview: d.previewMediaId ? mediaUrl(d.previewMediaId) : null,
          updatedAt: d.updatedAt.toISOString(),
        }))}
      />
      )}
      {tab === 'video' && (
        <VideoSection
          paid={isPaid(account) || user.role === 'SUPER_ADMIN'}
          videos={videos.map((v) => ({
            id: v.id,
            name: v.name,
            format: v.format,
            status: v.status,
            poster: posterOf(v),
            seconds: timeline(v.data as unknown as VideoDoc).total,
            updatedAt: v.updatedAt.toISOString(),
          }))}
        />
      )}
    </>
  )
}
