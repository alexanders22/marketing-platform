import type { Metadata } from 'next'
import Link from 'next/link'
import { Eye, Link2, MousePointerClick } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/EmptyState'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { NewBioButton } from './NewBioButton'

export const metadata: Metadata = { title: 'Bio Pages — Loudpilot' }

export default async function BioPagesPage() {
  const { workspace } = await requireContext()
  const pages = await prisma.bioPage.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { clicks: true } } },
  })
  return (
    <>
      <PageHeader
        title="Bio Pages"
        sub="One link for your profile bio — your offers, contacts and socials on a single page."
        action={<NewBioButton />}
      />
      {pages.length === 0 ? (
        <div className="rounded-xl border border-zinc-200">
          <EmptyState icon={Link2} title="No bio pages yet" action={<NewBioButton />}>
            Build a link-in-bio page in your brand colours, put its link in your Instagram or TikTok bio and see every
            click.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pages.map((p) => (
            <Link key={p.id} href={`/app/bio/${p.id}`} className="rounded-xl border border-zinc-200 p-5 transition hover:border-zinc-300 hover:shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="truncate font-semibold">{p.title}</h2>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${p.published ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  {p.published ? 'Live' : 'Draft'}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-zinc-500">/b/{p.slug}</p>
              <p className="mt-4 flex gap-4 text-sm text-zinc-600">
                <span className="inline-flex items-center gap-1.5">
                  <Eye size={15} /> {p.views.toLocaleString()} views
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MousePointerClick size={15} /> {p._count.clicks.toLocaleString()} clicks
                </span>
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
