import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requireContext } from '@/lib/context'
import type { InterviewData } from '@/lib/interview'
import { prisma } from '@/lib/prisma'
import { Interview } from './Interview'

export const metadata: Metadata = { title: 'Strategy interview — Loudpilot' }

export default async function InterviewChatPage({ params }: PageProps<'/app/strategy/interview/[id]'>) {
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') redirect('/app/strategy')
  const { id } = await params
  const row = await prisma.strategyInterview.findFirst({ where: { id, workspaceId: workspace.id } })
  if (!row) notFound()
  return <Interview id={row.id} company={workspace.name} initial={row.data as unknown as InterviewData} planId={row.status === 'DONE' ? row.planId : null} />
}
