import type { NextRequest } from 'next/server'
import { validMediaSignature } from '@/lib/media-url'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/session'
import { readMedia } from '@/lib/storage'

// Private media: only members of the account that owns the workspace — or
// anyone holding a short-lived signed link (used when a network fetches the
// image to publish it).
export async function GET(req: NextRequest, ctx: RouteContext<'/media/[id]'>) {
  const { id } = await ctx.params
  const signed = validMediaSignature(id, req.nextUrl.searchParams.get('exp'), req.nextUrl.searchParams.get('sig'))

  let media
  if (signed) {
    media = await prisma.media.findUnique({ where: { id } })
  } else {
    const user = await getSessionUser()
    if (!user) return new Response('Not found', { status: 404 })
    media = await prisma.media.findFirst({
      where: { id, workspace: { account: { members: { some: { userId: user.id } } } } },
    })
  }
  if (!media) return new Response('Not found', { status: 404 })

  const data = await readMedia(media.path)
  return new Response(new Uint8Array(data), {
    headers: {
      'content-type': media.mime,
      'cache-control': signed ? 'public, max-age=300' : 'private, max-age=31536000, immutable',
      'content-disposition': `inline; filename="khma-${media.id}.${media.mime.split('/')[1] ?? 'bin'}"`,
    },
  })
}
