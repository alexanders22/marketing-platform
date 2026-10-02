import 'server-only'
import { cache } from 'react'
import { prisma } from './prisma'
import { requireUser } from './session'

// The signed-in user plus the account and workspace they are working in.
// A user can belong to several accounts (agencies); for now the first
// membership and its first workspace are used.
export const requireContext = cache(async () => {
  const user = await requireUser()
  const membership = await prisma.accountMember.findFirst({
    where: { userId: user.id },
    orderBy: { id: 'asc' },
    include: {
      account: { include: { workspaces: { orderBy: { createdAt: 'asc' }, take: 1 } } },
    },
  })
  const workspace = membership?.account.workspaces[0]
  // Every signup creates a workspace, so this only happens for staff-only users.
  if (!membership || !workspace) throw new Error('This user has no workspace')
  return { user, account: membership.account, role: membership.role, workspace }
})
