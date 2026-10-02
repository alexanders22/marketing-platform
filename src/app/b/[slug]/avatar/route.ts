import { prisma } from '@/lib/prisma'
import { readMedia } from '@/lib/storage'

// The one piece of media that is public: a published bio page's avatar.
export async function GET(_req: Request, ctx: RouteContext<'/b/[slug]/avatar'>) {
  const { slug } = await ctx.params
  const page = await prisma.bioPage.findUnique({ where: { slug: slug.toLowerCase() } })
  if (!page?.published || !page.avatarMediaId) return new Response('Not found', { status: 404 })
  const media = await prisma.media.findFirst({ where: { id: page.avatarMediaId, workspaceId: page.workspaceId } })
  if (!media) return new Response('Not found', { status: 404 })
  const data = await readMedia(media.path)
  return new Response(new Uint8Array(data), {
    headers: { 'content-type': media.mime, 'cache-control': 'public, max-age=300' },
  })
}
