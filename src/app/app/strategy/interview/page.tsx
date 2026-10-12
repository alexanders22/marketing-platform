import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { InterviewStart } from './InterviewStart'

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

export const metadata: Metadata = { title: 'Strategy interview — Loudpilot' }

export default async function InterviewPage({ searchParams }: PageProps<'/app/strategy/interview'>) {
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') redirect('/app/strategy')
  const { welcome } = await searchParams
  // An unfinished interview from the last two weeks can be continued.
  const open = await prisma.strategyInterview.findFirst({
    where: { workspaceId: workspace.id, status: 'OPEN', createdAt: { gt: daysAgo(14) } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  const facts = await prisma.businessFact.count({ where: { workspaceId: workspace.id } })
  return <InterviewStart company={workspace.name} resumeId={open?.id ?? null} returning={facts > 0} welcome={welcome === '1'} />
}
