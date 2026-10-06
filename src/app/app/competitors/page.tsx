import type { Metadata } from 'next'
import type { CompanyProfile, CompetitorReportData } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { Competitors } from './Competitors'

export const metadata: Metadata = { title: 'Competitors — Loudpilot' }

export default async function CompetitorsPage() {
  const { workspace } = await requireContext()
  const [rivals, report] = await Promise.all([
    prisma.competitor.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'asc' } }),
    prisma.competitorReport.findFirst({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'desc' } }),
  ])
  return (
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
  )
}
