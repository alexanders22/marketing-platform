import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { mediaUrl } from '@/lib/storage'
import { safeFetchBytes } from '@/lib/safe-fetch'
import { isFormat, type VideoDoc } from '@/lib/video'
import { VideoEditor } from './VideoEditor'

export const metadata: Metadata = { title: 'Video — Loudpilot Studio' }

export default async function VideoPage({ params }: PageProps<'/app/studio/video/[id]'>) {
  const { workspace, brand } = await requireContext()
  const { id } = await params
  const v = await prisma.video.findFirst({ where: { id, workspaceId: workspace.id } })
  if (!v) notFound()
  const out = v.outputMediaId ? await prisma.media.findUnique({ where: { id: v.outputMediaId }, select: { id: true, posterId: true } }) : null
  const logo = await logoDataUrl(brand?.logoUrl ?? null)
  return (
    <VideoEditor
      video={{ id: v.id, name: v.name, format: isFormat(v.format) ? v.format : '9:16', doc: v.data as unknown as VideoDoc }}
      brand={{ name: workspace.name, colors: brand?.colors ?? [], logoUrl: logo }}
      initialStatus={{
        status: v.status,
        error: v.error,
        output: out ? { url: mediaUrl(out.id), poster: out.posterId ? mediaUrl(out.posterId) : null } : null,
      }}
    />
  )
}

// The end card is drawn on a canvas in the browser, which refuses images from
// other sites — hand it the logo as a data URL instead.
async function logoDataUrl(url: string | null) {
  if (!url) return null
  if (url.startsWith('/media/')) return url
  try {
    const r = await safeFetchBytes(url, { maxBytes: 1_500_000, timeoutMs: 5000, accept: 'image/*' })
    const type = r.contentType?.split(';')[0].trim()
    if (!type?.startsWith('image/') || r.bytes.length === 0) return null
    return `data:${type};base64,${r.bytes.toString('base64')}`
  } catch {
    return null
  }
}
