import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { prisma } from './prisma'
import { requireUser } from './session'

// The signed-in user plus the account and workspace they are working in.
// A user can belong to several accounts (agencies); for now the first
// membership and its first workspace are used. No membership yet means the
// user has not finished onboarding.
export const requireContext = cache(async () => {
  const user = await requireUser()
  const membership = await prisma.accountMember.findFirst({
    where: { userId: user.id },
    orderBy: { id: 'asc' },
    include: {
      account: {
        include: { workspaces: { orderBy: { createdAt: 'asc' }, take: 1, include: { brandKit: true } } },
      },
    },
  })
  const workspace = membership?.account.workspaces[0]
  if (!membership || !workspace) redirect('/onboarding')
  return { user, account: membership.account, role: membership.role, workspace, brand: workspace.brandKit }
})
