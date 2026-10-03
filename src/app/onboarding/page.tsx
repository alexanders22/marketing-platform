import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { Onboarding } from './Onboarding'

export const metadata: Metadata = { title: 'Set up your brand — Loudpilot' }

export default async function OnboardingPage() {
  const user = await requireUser()
  const member = await prisma.accountMember.findFirst({ where: { userId: user.id }, select: { id: true } })
  if (member) redirect('/app')
  return <Onboarding />
}
