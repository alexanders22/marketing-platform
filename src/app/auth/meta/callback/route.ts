import { NextResponse, after, type NextRequest } from 'next/server'
import { requireContext } from '@/lib/context'
import { encrypt } from '@/lib/crypto'
import { META_STATE_COOKIE, exchangeMetaCode, listAdAccounts, listPages, metaEnabled } from '@/lib/meta'
import { refreshDossier } from '@/lib/dossier'
import { syncAdAccount } from '@/lib/meta-ads'
import { prisma } from '@/lib/prisma'
import { unseal } from '@/lib/signed'
import { terminalUrl } from '@/lib/hosts'

// Meta sends the person back here. Every Page they picked becomes a FACEBOOK
// account, its linked Instagram professional account an INSTAGRAM account,
// and (with ads_read) each ad account a META_ADS account.
//
// Two ways in: from Channels (signed-in user, their current workspace) or a
// partner connect link (workspace + returnUrl sealed in the state cookie).
const PARTNER_REASON: Record<string, string> = {
  'meta-off': 'not_configured',
  'meta-denied': 'cancelled',
  'meta-state': 'expired',
  'meta-api': 'meta_error',
  'meta-empty': 'nothing_shared',
}

export async function GET(req: NextRequest) {
  const cookie = unseal<{ s: string; ws?: string; ret?: string }>(req.cookies.get(META_STATE_COOKIE)?.value)
  const partner = cookie?.ws && cookie.ret ? { ws: cookie.ws, ret: cookie.ret } : null

  const redirect = (url: string | URL) => {
    const res = NextResponse.redirect(url)
    res.cookies.delete({ name: META_STATE_COOKIE, path: '/auth/meta' })
    return res
  }
  const join = (base: string, q: string) => `${base}${base.includes('?') ? '&' : '?'}${q}`
  const back = (q: string) => {
    if (partner) {
      const [k, v] = q.split('=')
      return redirect(
        join(partner.ret, k === 'connected' ? `loudpilot_status=connected&loudpilot_accounts=${v}` : `loudpilot_status=error&loudpilot_reason=${PARTNER_REASON[v] ?? 'error'}`),
      )
    }
    return redirect(new URL(`/app/channels?${q}`, terminalUrl()))
  }

  let workspaceId: string
  if (partner) {
    workspaceId = partner.ws
  } else {
    const { workspace, role } = await requireContext()
    if (role === 'EDITOR') return back('error=role')
    workspaceId = workspace.id
  }
  if (!metaEnabled()) return back('error=meta-off')

  const q = req.nextUrl.searchParams
  if (q.get('error')) return back('error=meta-denied')
  const code = q.get('code')
  const state = q.get('state')
  if (!code || !state || !cookie || state !== cookie.s) return back('error=meta-state')

  let user, pages, ads
  try {
    user = await exchangeMetaCode(code)
    pages = await listPages(user.token)
    ads = user.granted.includes('ads_read') || user.granted.includes('ads_management') ? await listAdAccounts(user.token) : []
  } catch (e) {
    console.error('Meta connect failed', e)
    return back('error=meta-api')
  }
  if (pages.length === 0 && ads.length === 0) return back('error=meta-empty')

  const base = { connectedBy: user.userId, scopes: user.granted, status: 'ACTIVE' as const, lastError: null }
  const rows = [
    ...pages.map((p) => ({
      network: 'FACEBOOK' as const,
      externalId: p.id,
      name: p.name,
      handle: null,
      avatarUrl: p.picture?.data?.url ?? null,
      parentId: null,
      token: p.access_token,
      expiresAt: null,
      meta: undefined,
    })),
    ...pages
      .filter((p) => p.instagram_business_account)
      .map((p) => {
        const ig = p.instagram_business_account!
        return {
          network: 'INSTAGRAM' as const,
          externalId: ig.id,
          name: ig.name || ig.username || p.name,
          handle: ig.username ?? null,
          avatarUrl: ig.profile_picture_url ?? null,
          parentId: p.id,
          token: p.access_token,
          expiresAt: null,
          meta: undefined,
        }
      }),
    ...ads.map((a) => ({
      network: 'META_ADS' as const,
      externalId: a.id,
      name: a.name,
      handle: null,
      avatarUrl: null,
      parentId: null,
      token: user.token,
      expiresAt: user.expiresAt,
      meta: { currency: a.currency, timeZone: a.timezone_name, accountStatus: a.account_status },
    })),
  ]

  const saved = await prisma.$transaction(
    rows.map(({ token, ...r }) =>
      prisma.socialAccount.upsert({
        where: { workspaceId_network_externalId: { workspaceId, network: r.network, externalId: r.externalId } },
        create: { workspaceId, ...r, ...base, accessTokenEnc: encrypt(token) },
        update: { ...r, ...base, accessTokenEnc: encrypt(token) },
      }),
    ),
  )
  // Read ad campaigns, then post and ad history and the audit, right away
  // instead of waiting for the ticker.
  after(async () => {
    for (const a of saved.filter((s) => s.network === 'META_ADS')) {
      await syncAdAccount(a.id).catch((e) => console.error('ads sync failed', a.id, e instanceof Error ? e.message : e))
    }
    await refreshDossier(workspaceId).catch((e) => console.error('dossier failed', workspaceId, e instanceof Error ? e.message : e))
  })
  return back(`connected=${rows.length}`)
}
