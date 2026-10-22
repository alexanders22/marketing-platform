import type { Prisma } from '@prisma/client'
import { GRACE_MS } from './plans'

// Workspaces whose account is not paused by a super admin. Partner
// workspaces without an account yet count as active.
export const ACTIVE_WORKSPACE = { NOT: { account: { is: { pausedAt: { not: null } } } } } satisfies Prisma.WorkspaceWhereInput

// Workspaces whose account may publish and get background AI work (see
// serviceOn in plans.ts): not paused, and a partner's, on a trial, or paid
// (with the grace days after it).
export const servedWorkspace = (now = new Date()): Prisma.WorkspaceWhereInput => ({
  AND: [
    ACTIVE_WORKSPACE,
    {
      OR: [
        { accountId: null },
        { account: { is: { partnerId: { not: null } } } },
        { account: { is: { paidUntil: { gt: new Date(now.getTime() - GRACE_MS) } } } },
        { account: { is: { plan: { not: 'NONE' }, trialEndsAt: { gt: now } } } },
      ],
    },
  ],
})
