import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BioView } from '@/components/BioView'
import { BioBlock, BioTheme } from '@/lib/bio'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

async function load(slug: string) {
  const page = await prisma.bioPage.findUnique({ where: { slug: slug.toLowerCase() } })
  if (!page || !page.published) return null
  // Stored JSON is validated on save; parse again so a bad row can't break the page.
  const theme = BioTheme.safeParse(page.theme)
  const blocks = z.array(BioBlock).safeParse(page.blocks)
  if (!theme.success || !blocks.success) return null
  return { page, theme: theme.data, blocks: blocks.data }
}

export async function generateMetadata({ params }: PageProps<'/b/[slug]'>): Promise<Metadata> {
  const data = await load((await params).slug)
  if (!data) return { title: 'Not found' }
  return { title: data.page.title, description: data.page.bio.slice(0, 160) }
}

export default async function PublicBioPage({ params }: PageProps<'/b/[slug]'>) {
  const { slug } = await params
  const data = await load(slug)
  if (!data) notFound()
  const { page, theme, blocks } = data
  await prisma.bioPage.update({ where: { id: page.id }, data: { views: { increment: 1 } } })

  return (
    <div className="min-h-screen [color-scheme:light]" style={{ background: theme.background }}>
      <BioView
        title={page.title}
        bio={page.bio}
        avatar={page.avatarMediaId ? `/b/${page.slug}/avatar` : null}
        theme={theme}
        blocks={blocks}
        linkHref={(b) => `/b/${page.slug}/go/${b.id}`}
      />
    </div>
  )
}
