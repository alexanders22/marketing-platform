import type { Metadata } from 'next'
import Link from 'next/link'
import { Flag } from 'lucide-react'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { metricDef } from '@/lib/goal-metrics'
import { momentumOf } from '@/lib/momentum'
import { Celebrate } from './Celebrate'
import { GoalCards, STATUS } from './GoalCards'
import { GoalForm } from './GoalForm'
import { goalName } from './GoalList'
import { Badges, MomentumHero } from './Momentum'
import { Quests } from './Quests'

export const metadata: Metadata = { title: 'Goals — Loudpilot' }


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
  const active = goals.filter((g) => g.active)
  const counts = { OFF_TRACK: 0, AT_RISK: 0, ON_TRACK: 0, NO_DATA: 0 }
  for (const g of active) counts[g.status]++
  const m = await momentumOf(workspace.id)
  const has = { ads: ads > 0, posts: posts > 0, website: website > 0 }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
          <p className="text-sm text-zinc-500">Set the numbers that matter. Loudpilot checks them every hour, alerts you when they slip — and keeps score.</p>
        </div>
        {canEdit && (ads > 0 || posts > 0 || website > 0) && (
          <GoalForm campaigns={campaigns} currency={currency} hasAds={ads > 0} hasPosts={posts > 0} hasWebsite={website > 0} events={events} />
        )}
      </div>

      <MomentumHero m={m} onTrack={counts.ON_TRACK} active={active.length} />

      {ads === 0 && posts === 0 && website === 0 ? (
        <section className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white">
            <Flag size={22} />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Connect an ad account, a page or Google Analytics first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">Goals watch real results — cost per lead, reach, views, sign-ups and more.</p>
          <Link href="/app/channels" className="mt-5 inline-flex rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white">
            Connect channels
          </Link>
        </section>
      ) : (
        <>
          {goals.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <h2 className="mr-2 font-semibold">Your goals</h2>
                {(['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'NO_DATA'] as const)
                  .filter((k) => counts[k] > 0)
                  .map((k) => {
                    const S = STATUS[k]
                    return (
                      <span key={k} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${S.pill}`}>
                        <S.icon size={12} /> {counts[k]} {S.label.toLowerCase()}
                      </span>
                    )
                  })}
              </div>
              <GoalCards goals={goals} currency={currency} canEdit={canEdit} history={m.history} streaks={m.goalStreaks} />
            </section>
          )}
          {active.length < 6 && <Quests has={has} canEdit={canEdit} taken={active.map((g) => g.metric)} />}
        </>
      )}

      <Badges badges={m.badges} />
      <Celebrate
        workspaceId={workspace.id}
        goals={active.map((g) => ({ id: g.id, name: `${metricDef(g.metric)?.label ?? g.metric} — ${goalName(g)}`, status: g.status }))}
        level={m.level}
        levelName={m.levelName}
      />
    </div>
  )
}
