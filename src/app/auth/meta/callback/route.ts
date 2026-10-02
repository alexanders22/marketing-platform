import { NextResponse, after, type NextRequest } from 'next/server'
import { requireContext } from '@/lib/context'
import { encrypt } from '@/lib/crypto'
import { exchangeMetaCode, listAdAccounts, listPages, metaEnabled } from '@/lib/meta'
import { syncAdAccount } from '@/lib/meta-ads'
import { prisma } from '@/lib/prisma'

// Meta sends the person back here. Every Page they picked becomes a FACEBOOK
// account, its linked Instagram professional account an INSTAGRAM account,
// and (with ads_read) each ad account a META_ADS account.
export async function GET(req: NextRequest) {
  const { workspace, role } = await requireContext()
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/app/channels?${q}`, req.url))
    res.cookies.delete({ name: 'khma_meta_state', path: '/auth/meta' })
    return res
  }
  if (!metaEnabled()) return back('error=meta-off')
  if (role === 'EDITOR') return back('error=role')

  const q = req.nextUrl.searchParams
  if (q.get('error')) return back('error=meta-denied')
  const code = q.get('code')
  const state = q.get('state')
  const expected = req.cookies.get('khma_meta_state')?.value
  if (!code || !state || !expected || state !== expected) return back('error=meta-state')

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
        where: { workspaceId_network_externalId: { workspaceId: workspace.id, network: r.network, externalId: r.externalId } },
        create: { workspaceId: workspace.id, ...r, ...base, accessTokenEnc: encrypt(token) },
        update: { ...r, ...base, accessTokenEnc: encrypt(token) },
      }),
    ),
  )
  // Read ad campaigns right away instead of waiting for the hourly ticker.
  after(async () => {
    for (const a of saved.filter((s) => s.network === 'META_ADS')) {
      await syncAdAccount(a.id).catch((e) => console.error('ads sync failed', a.id, e instanceof Error ? e.message : e))
    }
  })
  return back(`connected=${rows.length}`)
}
