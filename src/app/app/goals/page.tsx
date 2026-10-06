import type { Metadata } from 'next'
import Link from 'next/link'
import { Flag } from 'lucide-react'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { GoalForm } from './GoalForm'
import { GoalList } from './GoalList'

export const metadata: Metadata = { title: 'Goals — Loudpilot' }

const STATUS = {
  ON_TRACK: { label: 'On track', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  AT_RISK: { label: 'At risk', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  OFF_TRACK: { label: 'Off track', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700', bar: 'bg-red-500' },
  NO_DATA: { label: 'No data yet', dot: 'bg-zinc-300', pill: 'bg-zinc-100 text-zinc-600', bar: 'bg-zinc-300' },
} as const

export default async function GoalsPage() {
  const { workspace, role } = await requireContext()
  const [goals, campaigns, ads, posts] = await Promise.all([
    prisma.goal.findMany({
      where: { workspaceId: workspace.id },
      include: { adCampaign: { select: { name: true, currency: true } } },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.adCampaign.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, status: true, currency: true },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    }),
    prisma.socialAccount.count({ where: { workspaceId: workspace.id, network: 'META_ADS' } }),
    prisma.socialAccount.count({ where: { workspaceId: workspace.id, network: { in: ['FACEBOOK', 'INSTAGRAM'] } } }),
  ])
  const website = await prisma.socialAccount.count({ where: { workspaceId: workspace.id, network: 'GOOGLE_ANALYTICS', NOT: { externalId: { startsWith: 'pending:' } } } })
  // Key events the website has reported, for goals on one of them.
  const recent = website
    ? await prisma.websiteDay.findMany({ where: { workspaceId: workspace.id }, orderBy: { date: 'desc' }, take: 90, select: { events: true } })
    : []
  const events = [...new Set(recent.flatMap((d) => Object.keys((d.events ?? {}) as Record<string, number>)))].sort()
  const currency = campaigns.find((c) => c.currency)?.currency ?? null
  const canEdit = role !== 'EDITOR'
  const counts = { OFF_TRACK: 0, AT_RISK: 0, ON_TRACK: 0, NO_DATA: 0 }
  for (const g of goals.filter((g) => g.active)) counts[g.status]++

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
          <p className="text-sm text-zinc-500">Set the numbers that matter. Loudpilot checks them every hour and alerts you when they slip.</p>
        </div>
        {canEdit && (ads > 0 || posts > 0 || website > 0) && (
          <GoalForm campaigns={campaigns} currency={currency} hasAds={ads > 0} hasPosts={posts > 0} hasWebsite={website > 0} events={events} />
        )}
      </div>

      {ads === 0 && posts === 0 && website === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-zinc-100">
            <Flag size={22} />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Connect an ad account, a page or Google Analytics first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            Goals watch real results — cost per lead, reach, views, likes and more.
          </p>
          <Link href="/app/channels" className="mt-5 inline-flex rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white">
            Connect channels
          </Link>
        </section>
      ) : goals.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 p-8 text-sm text-zinc-600">
          <p className="font-medium text-zinc-900">Ideas to start with</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Cost per lead at most ₾5 over the last 7 days</li>
            <li>At least 80 leads over the last 7 days for your main campaign</li>
            <li>Average reach per Instagram post at least 1,000</li>
            <li>Engagement rate at least 3% over the last 30 days</li>
            <li>At least 3 posts a week</li>
            <li>At least 50 sign-ups a month from the website, at most ₾8 of ads per sign-up</li>
          </ul>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            {(['OFF_TRACK', 'AT_RISK', 'ON_TRACK', 'NO_DATA'] as const).map((k) => (
              <span key={k} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${STATUS[k].pill}`}>
                <span className={`h-2 w-2 rounded-full ${STATUS[k].dot}`} /> {counts[k]} {STATUS[k].label.toLowerCase()}
              </span>
            ))}
          </div>
          <GoalList goals={goals} currency={currency} canEdit={canEdit} />
        </>
      )}
    </div>
  )
}
