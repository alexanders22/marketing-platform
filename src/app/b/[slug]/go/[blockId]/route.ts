import { NextResponse } from 'next/server'
import { z } from 'zod'
import { BioBlock } from '@/lib/bio'
import { prisma } from '@/lib/prisma'
import { appUrl } from '@/lib/mail'

// Counts the click, then sends the visitor to the link stored on the page —
// never to a URL taken from the request, so this can't be an open redirect.
export async function GET(req: Request, ctx: RouteContext<'/b/[slug]/go/[blockId]'>) {
  const { slug, blockId } = await ctx.params
  const page = await prisma.bioPage.findUnique({ where: { slug: slug.toLowerCase() } })
  const blocks = z.array(BioBlock).safeParse(page?.blocks)
  const link = blocks.success ? blocks.data.find((b) => b.id === blockId && b.type === 'link' && b.enabled) : undefined
  if (!page?.published || !link || link.type !== 'link') return NextResponse.redirect(new URL(`/b/${slug}`, appUrl()))

  await prisma.bioClick.create({ data: { pageId: page.id, blockId } })
  return NextResponse.redirect(link.url, 302)
}
