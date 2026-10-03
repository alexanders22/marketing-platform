import type { Metadata } from 'next'
import type { CompanyProfile } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { PlanWizard } from './PlanWizard'

export const metadata: Metadata = { title: 'New plan — Loudpilot' }

export default async function NewPlanPage() {
  const { workspace, account } = await requireContext()
  const [profile, audit, ads, campaign] = await Promise.all([
    prisma.brandProfile.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.brandAudit.count({ where: { workspaceId: workspace.id } }),
    prisma.socialAccount.count({ where: { workspaceId: workspace.id, network: 'META_ADS' } }),
    prisma.adCampaign.findFirst({ where: { workspaceId: workspace.id, currency: { not: null } }, select: { currency: true } }),
  ])
  const offerings = ((profile?.data as CompanyProfile | undefined)?.offerings ?? []).map((o) => o.name).filter(Boolean)
  return (
    <PlanWizard offerings={offerings} currency={campaign?.currency ?? account.currency} hasAds={ads > 0} hasDossier={Boolean(profile) || audit > 0} />
  )
}
