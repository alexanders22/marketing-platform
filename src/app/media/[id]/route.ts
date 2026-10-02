import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/session'
import { readMedia } from '@/lib/storage'

// Private media: only members of the account that owns the workspace.
export async function GET(_req: Request, ctx: RouteContext<'/media/[id]'>) {
  const user = await getSessionUser()
  if (!user) return new Response('Not found', { status: 404 })
  const { id } = await ctx.params

  const media = await prisma.media.findFirst({
    where: { id, workspace: { account: { members: { some: { userId: user.id } } } } },
  })
  if (!media) return new Response('Not found', { status: 404 })

  const data = await readMedia(media.path)
  return new Response(new Uint8Array(data), {
    headers: {
      'content-type': media.mime,
      'cache-control': 'private, max-age=31536000, immutable',
      'content-disposition': `inline; filename="khma-${media.id}.${media.mime.split('/')[1] ?? 'bin'}"`,
    },
  })
}
