import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { mediaUrl } from '@/lib/storage'
import { Planner, type PlannerPost } from './Planner'

export const metadata: Metadata = { title: 'Planner — Loudpilot' }

export default async function PlannerPage({ searchParams }: PageProps<'/app/planner'>) {
  const { workspace } = await requireContext()
  const sp = await searchParams
  const view = sp.view === 'list' ? 'list' : 'calendar'
  const now = new Date()
  const month =
    typeof sp.m === 'string' && /^\d{4}-\d{2}$/.test(sp.m)
      ? sp.m
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [y, m] = month.split('-').map(Number)

  // A little wider than the month so the 6-week grid edges and time zones are covered.
  const from = new Date(Date.UTC(y, m - 1, 1) - 8 * 86_400_000)
  const to = new Date(Date.UTC(y, m, 1) + 15 * 86_400_000)

  const rows =
    view === 'calendar'
      ? await prisma.post.findMany({
          where: { workspaceId: workspace.id, scheduledAt: { gte: from, lt: to } },
          orderBy: { scheduledAt: 'asc' },
        })
      : await prisma.post.findMany({
          where: { workspaceId: workspace.id },
          orderBy: [{ scheduledAt: 'asc' }, { updatedAt: 'desc' }],
          take: 300,
        })

  const posts: PlannerPost[] = rows.map((p) => ({
    id: p.id,
    kind: p.kind,
    title: p.title,
    text: (p.kind === 'BLOG' ? p.title : p.content)?.slice(0, 160) ?? '',
    channels: p.channels,
    image: p.mediaIds[0] ? mediaUrl(p.mediaIds[0]) : null,
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    campaignId: p.campaignId,
    hasBody: p.content.trim().length > 0,
    status: p.status,
  }))

  return <Planner view={view} month={month} posts={posts} now={now.getTime()} />
}
