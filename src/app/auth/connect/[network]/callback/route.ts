import { NextResponse, after, type NextRequest } from 'next/server'
import { requireContext } from '@/lib/context'
import { encrypt } from '@/lib/crypto'
import { terminalUrl } from '@/lib/hosts'
import { appUrl } from '@/lib/mail'
import { connectorBySlug } from '@/lib/networks'
import { planLimits } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { PROFILE_NETWORKS } from '@/lib/profiles'
import { refreshDossier } from '@/lib/dossier'
import { unseal } from '@/lib/signed'
import { CONNECT_COOKIE } from '@/lib/networks/types'

// Back from the network's sign-in: exchange the code, save the accounts
// (tokens encrypted) while the plan has room for more social profiles.
export async function GET(req: NextRequest, ctx: RouteContext<'/auth/connect/[network]/callback'>) {
  const { network } = await ctx.params
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/app/channels?${q}`, terminalUrl()))
    res.cookies.delete({ name: CONNECT_COOKIE, path: '/auth/connect' })
    return res
  }
  const { workspace, role, account } = await requireContext()
  const c = connectorBySlug(network)
  if (!c?.oauth || !c.enabled()) return back('error=network-off')
  if (role === 'EDITOR') return back('error=role')
  const q = req.nextUrl.searchParams
  if (q.get('error')) return back(`error=network-denied&network=${network}`)
  const cookie = unseal<{ s: string; ws: string; n: string; v?: string }>(req.cookies.get(CONNECT_COOKIE)?.value)
  const code = q.get('code')
  if (!code || !cookie || cookie.s !== q.get('state') || cookie.ws !== workspace.id || cookie.n !== network) return back('error=network-state')

  let found
  try {
    found = await c.oauth.exchange({ code, redirectUri: `${appUrl()}/auth/connect/${network}/callback`, verifier: cookie.v })
  } catch (e) {
    console.error(`${c.network} connect failed`, e instanceof Error ? e.message : e)
    return back(`error=network-api&network=${network}`)
  }
  if (found.length === 0) return back(`error=network-empty&network=${network}`)

  // Profiles already here are refreshed; new ones take free plan room.
  const existing = await prisma.socialAccount.findMany({
    where: { workspace: { accountId: account.id }, network: { in: PROFILE_NETWORKS } },
    select: { workspaceId: true, network: true, externalId: true },
  })
  const known = new Set(existing.filter((e) => e.workspaceId === workspace.id && e.network === c.network).map((e) => e.externalId))
  let room = planLimits(account.plan).profiles - existing.length
  let skipped = 0
  const allowed = found.filter((f) => {
    if (known.has(f.externalId)) return true
    if (room > 0) {
      room--
      return true
    }
    skipped++
    return false
  })
  if (allowed.length === 0) return back('error=profiles')

  for (const f of allowed) {
    const data = {
      name: f.name.slice(0, 200),
      handle: f.handle ?? null,
      avatarUrl: f.avatarUrl ?? null,
      parentId: f.parentId ?? null,
      meta: (f.meta ?? {}) as object,
      accessTokenEnc: encrypt(f.token),
      refreshTokenEnc: f.refresh ? encrypt(f.refresh) : null,
      expiresAt: f.expiresAt ?? null,
      refreshExpiresAt: f.refreshExpiresAt ?? null,
      scopes: f.scopes,
      status: 'ACTIVE' as const,
      lastError: null,
    }
    await prisma.socialAccount.upsert({
      where: { workspaceId_network_externalId: { workspaceId: workspace.id, network: c.network, externalId: f.externalId } },
      create: { workspaceId: workspace.id, network: c.network, externalId: f.externalId, ...data },
      update: data,
    })
  }
  after(() => refreshDossier(workspace.id).catch(() => {}))
  return back(`connected=${allowed.length}${skipped ? `&skipped=${skipped}` : ''}`)
}
