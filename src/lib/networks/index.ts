import 'server-only'
import type { SocialAccount, SocialNetwork } from '@prisma/client'
import { decrypt, encrypt } from '../crypto'
import { prisma } from '../prisma'
import { linkedin } from './linkedin'
import { pinterest } from './pinterest'
import { telegram } from './telegram'
import { threads } from './threads'
import { tiktok } from './tiktok'
import { NetworkError, type Connector } from './types'
import { x } from './x'
import { youtube } from './youtube'

export { NetworkError } from './types'
export type { Connector, Outgoing, OutMedia } from './types'

// Every network besides Facebook and Instagram, in the order shown in Channels.
export const CONNECTORS: Connector[] = [tiktok, linkedin, youtube, x, threads, telegram, pinterest]
export const connectorFor = (n: SocialNetwork | string) => CONNECTORS.find((c) => c.network === n)
export const connectorBySlug = (slug: string) => CONNECTORS.find((c) => c.network.toLowerCase() === slug)
export const slugOf = (c: Connector) => c.network.toLowerCase()

// A usable access token: refreshed (and stored) when it runs out within
// five minutes. A refresh that fails means the account must reconnect.
export async function tokenFor(account: SocialAccount): Promise<string> {
  if (!account.accessTokenEnc) throw new NetworkError('This account has no access token — reconnect it', true)
  const c = connectorFor(account.network)
  const due = (a: SocialAccount) => !!a.expiresAt && a.expiresAt.getTime() <= Date.now() + (c?.refreshAheadMs ?? 5 * 60_000)
  if (!c?.refresh || !due(account)) return decrypt(account.accessTokenEnc)
  // One refresh at a time per account: some networks (X) accept each
  // refresh token only once.
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${'token:' + account.id}))`
      const a = await tx.socialAccount.findUniqueOrThrow({ where: { id: account.id } })
      if (!due(a)) return decrypt(a.accessTokenEnc!)
      const stored = c.refreshWithAccess ? a.accessTokenEnc : a.refreshTokenEnc
      if (!stored) throw new NetworkError('The sign-in expired — reconnect this account', true)
      let t
      try {
        t = await c.refresh!(a, decrypt(stored))
      } catch (e) {
        // Still valid for now (refreshed early): keep using it.
        if (a.expiresAt && a.expiresAt.getTime() > Date.now() + 60_000) return decrypt(a.accessTokenEnc!)
        throw new NetworkError(`The sign-in expired — reconnect this account (${e instanceof Error ? e.message : e})`, true)
      }
      await tx.socialAccount.update({
        where: { id: a.id },
        data: {
          accessTokenEnc: encrypt(t.token),
          expiresAt: t.expiresAt ?? null,
          ...(t.refresh ? { refreshTokenEnc: encrypt(t.refresh) } : {}),
          ...(t.refreshExpiresAt ? { refreshExpiresAt: t.refreshExpiresAt } : {}),
        },
      })
      return t.token
    },
    { timeout: 30_000 },
  )
}
