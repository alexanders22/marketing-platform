import 'server-only'
import { prisma } from './prisma'

// Everything received from Meta for one person: the accounts they connected
// (tokens, deliveries and insights cascade with them).
export async function forgetMetaUser(metaUserId: string) {
  const { count } = await prisma.socialAccount.deleteMany({
    where: { connectedBy: metaUserId, network: { in: ['FACEBOOK', 'INSTAGRAM', 'META_ADS'] } },
  })
  return count
}
