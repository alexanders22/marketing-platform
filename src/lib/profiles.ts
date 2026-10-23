import 'server-only'
import { PROFILE_NETWORKS } from './plans'
import { prisma } from './prisma'

export { PROFILE_NETWORKS }

// Social profiles of one company — the plan's limit is per company.
export const countProfiles = (workspaceId: string, db: Pick<typeof prisma, 'socialAccount'> = prisma) =>
  db.socialAccount.count({ where: { workspaceId, network: { in: PROFILE_NETWORKS } } })
