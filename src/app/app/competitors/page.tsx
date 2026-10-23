import type { Metadata } from 'next'
import type { CompanyProfile, CompetitorReportData } from '@/lib/ai'
import { appLang } from '@/lib/app-lang-server'
import { leaderboard } from '@/lib/benchmarks'
import { requireContext } from '@/lib/context'
import { DASH } from '@/lib/dash-copy'
import { prisma } from '@/lib/prisma'
import { Competitors } from './Competitors'
import { Leaderboard } from './Leaderboard'

export const metadata: Metadata = { title: 'Competitors — Loudpilot' }

export default async function CompetitorsPage() {
  const { workspace } = await requireContext()
  const [rivals, report, board, lang] = await Promise.all([
    prisma.competitor.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'asc' } }),
    prisma.competitorReport.findFirst({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'desc' } }),
    leaderboard(workspace.id),
    appLang(),
  ])
  const t = DASH[lang]
  return (
    <div className="space-y-8">
      <Competitors
        brand={workspace.name}
        competitors={rivals.map((r) => {
          const p = r.profile as CompanyProfile | null
          return {
            id: r.id,
            name: r.name,
            website: r.website,
            facebook: r.facebook,
            instagram: r.instagram,
            notes: r.notes,
            summary: p?.summary ?? null,
            offerings: p?.offerings.slice(0, 4) ?? [],
            analyzedAt: r.analyzedAt?.toISOString() ?? null,
            error: r.error,
          }
        })}
        report={report ? { data: report.data as unknown as CompetitorReportData, createdAt: report.createdAt.toISOString(), language: report.language } : null}
      />
      <Leaderboard board={board} t={t.board} whatIs={t.whatIs} link={false} />
    </div>
  )
}
