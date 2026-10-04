import type { Prisma } from '@prisma/client'

// Workspaces whose account is not paused by a super admin. Partner
// workspaces without an account yet count as active.
export const ACTIVE_WORKSPACE = { NOT: { account: { is: { pausedAt: { not: null } } } } } satisfies Prisma.WorkspaceWhereInput
