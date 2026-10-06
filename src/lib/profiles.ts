import 'server-only'
import type { SocialNetwork } from '@prisma/client'
import { prisma } from './prisma'

// Networks whose accounts count as "social profiles" against the plan (ad
// accounts, Analytics and Search Console don't).
export const PROFILE_NETWORKS: SocialNetwork[] = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'TELEGRAM', 'X', 'THREADS', 'PINTEREST']

// Social profiles across every company of the customer account.
export const countProfiles = (accountId: string) =>
  prisma.socialAccount.count({ where: { workspace: { accountId }, network: { in: PROFILE_NETWORKS } } })
