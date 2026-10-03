import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarRange, FileText, Plus, Target } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/EmptyState'
import { LocalTime } from '@/components/LocalTime'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = { title: 'Campaigns — Loudpilot' }

// Shown in the viewer's time zone, like the campaign page and the Planner.
const fmt = (d: Date) => <LocalTime iso={d.toISOString()} options={{ day: 'numeric', month: 'short' }} />

export default async function CampaignsPage() {
  const { workspace } = await requireContext()
  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { startsOn: 'desc' },
    include: { _count: { select: { posts: true } } },
  })
  const now = new Date()

  const newButtons = (
    <div className="flex flex-wrap gap-2">
      <Link href="/app/campaigns/new?kind=social" className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">
        <Plus size={16} /> Social campaign
      </Link>
      <Link href="/app/campaigns/new?kind=blog" className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50">
        <Plus size={16} /> Blog series
      </Link>
    </div>
  )

  return (
    <>
      <PageHeader title="Campaigns" sub="Plan a run of posts or articles around one goal — a launch, a sale, an event." action={newButtons} />
      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-zinc-200">
          <EmptyState icon={Target} title="No campaigns yet">
            Describe your goal once and Loudpilot plans the posts across the weeks you choose — then drops them into your
            Planner.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => {
            const live = c.startsOn <= now && c.endsOn >= now
            const done = c.endsOn < now
            return (
              <Link key={c.id} href={`/app/campaigns/${c.id}`} className="rounded-xl border border-zinc-200 p-5 transition hover:border-zinc-300 hover:shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className={`grid h-9 w-9 place-items-center rounded-lg ${c.kind === 'BLOG' ? 'bg-orange-50 text-orange-600' : 'bg-indigo-50 text-indigo-600'}`}>
                    {c.kind === 'BLOG' ? <FileText size={17} /> : <Target size={17} />}
                  </span>
                  <span className="text-xs font-medium text-zinc-500">{c.kind === 'BLOG' ? 'Blog series' : 'Social campaign'}</span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
                      live ? 'bg-emerald-50 text-emerald-700' : done ? 'bg-zinc-100 text-zinc-500' : 'bg-sky-50 text-sky-700'
                    }`}
                  >
                    {live ? 'Running' : done ? 'Finished' : 'Upcoming'}
                  </span>
                </div>
                <h2 className="mt-4 font-semibold">{c.name}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{c.brief}</p>
                <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-zinc-600">
                  <CalendarRange size={15} /> {fmt(c.startsOn)} – {fmt(c.endsOn)} · {c._count.posts} {c.kind === 'BLOG' ? 'articles' : 'posts'}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
