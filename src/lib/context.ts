import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { MemberRole } from '@prisma/client'
import { prisma } from './prisma'
import { requireUser } from './session'

// The company (workspace) the user is working in, remembered per browser.
export const WORKSPACE_COOKIE = 'khma_ws'

// Every company the user can switch to: all workspaces of every account they
// belong to. Paused accounts are listed (marked) so the switcher can explain.
export const listCompanies = cache(async (userId: string) => {
  const memberships = await prisma.accountMember.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          pausedAt: true,
          workspaces: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true, brandKit: { select: { logoUrl: true } } } },
        },
      },
    },
  })
  return memberships.flatMap((m) =>
    m.account.workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      logoUrl: w.brandKit?.logoUrl ?? null,
      accountId: m.account.id,
      accountName: m.account.name,
      role: m.role,
      paused: m.account.pausedAt !== null,
    })),
  )
})

export type Company = Awaited<ReturnType<typeof listCompanies>>[number]

// The signed-in user plus the account and workspace they are working in.
// The workspace comes from the switcher cookie when it is still one of
// theirs, else their first one. A super admin may open any workspace
// (`asAdmin` is then true when they are not a member). No workspace at all
// means onboarding is not finished.
export const requireContext = cache(async () => {
  const user = await requireUser()
  const companies = await listCompanies(user.id)
  const wanted = (await cookies()).get(WORKSPACE_COOKIE)?.value

  let pick = companies.find((c) => c.id === wanted && !c.paused) ?? companies.find((c) => !c.paused)
  let role: MemberRole | undefined = pick?.role
  let asAdmin = false
  if (wanted && user.role === 'SUPER_ADMIN' && pick?.id !== wanted) {
    // Super admin opened a company from the admin panel.
    if (await prisma.workspace.findFirst({ where: { id: wanted, accountId: { not: null } }, select: { id: true } })) {
      pick = undefined
      role = 'OWNER'
      asAdmin = true
    }
  }
  const workspaceId = asAdmin ? wanted! : pick?.id
  if (!workspaceId) redirect(companies.length > 0 ? '/paused' : '/onboarding')

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: { brandKit: true, account: true },
  })
  const account = workspace.account!
  return { user, account, role: role!, workspace, brand: workspace.brandKit, companies, asAdmin }
})
