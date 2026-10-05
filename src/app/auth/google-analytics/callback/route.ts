import { randomBytes } from 'node:crypto'
import { NextResponse, after, type NextRequest } from 'next/server'
import { requireContext } from '@/lib/context'
import { encrypt } from '@/lib/crypto'
import { GA_STATE_COOKIE, exchangeGaCode, gaEnabled, listProperties, syncWebsite } from '@/lib/ga'
import { terminalUrl } from '@/lib/hosts'
import { prisma } from '@/lib/prisma'
import { unseal } from '@/lib/signed'

// Google sends the person back here. One property → connected and read
// right away; several → a pending connection, picked on the Channels page.
export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/app/channels?${q}`, terminalUrl()))
    res.cookies.delete({ name: GA_STATE_COOKIE, path: '/auth/google-analytics' })
    return res
  }
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') return back('error=role')
  if (!gaEnabled()) return back('error=ga-off')
  const q = req.nextUrl.searchParams
  if (q.get('error')) return back('error=ga-denied')
  const cookie = unseal<{ s: string; ws: string }>(req.cookies.get(GA_STATE_COOKIE)?.value)
  const code = q.get('code')
  if (!code || !cookie || cookie.s !== q.get('state') || cookie.ws !== workspace.id) return back('error=ga-state')

  let tokens, properties
  try {
    tokens = await exchangeGaCode(code)
    properties = await listProperties(tokens.access)
  } catch (e) {
    console.error('GA connect failed', e instanceof Error ? e.message : e)
    return back('error=ga-api')
  }
  if (properties.length === 0) return back('error=ga-empty')

  const secrets = { accessTokenEnc: encrypt(tokens.access), refreshTokenEnc: encrypt(tokens.refresh), expiresAt: tokens.expiresAt, scopes: tokens.scopes }
  if (properties.length === 1) {
    const p = properties[0]
    const a = await prisma.socialAccount.upsert({
      where: { workspaceId_network_externalId: { workspaceId: workspace.id, network: 'GOOGLE_ANALYTICS', externalId: p.id } },
      create: { workspaceId: workspace.id, network: 'GOOGLE_ANALYTICS', externalId: p.id, name: p.name, handle: p.account || null, ...secrets },
      update: { name: p.name, handle: p.account || null, status: 'ACTIVE', lastError: null, ...secrets },
    })
    after(() => syncWebsite(a.id).catch((e) => console.error('GA first sync failed', e instanceof Error ? e.message : e)))
    return back('connected=1')
  }
  // Several properties: keep the access, ask which one.
  await prisma.socialAccount.deleteMany({ where: { workspaceId: workspace.id, network: 'GOOGLE_ANALYTICS', externalId: { startsWith: 'pending:' } } })
  await prisma.socialAccount.create({
    data: {
      workspaceId: workspace.id,
      network: 'GOOGLE_ANALYTICS',
      externalId: `pending:${randomBytes(8).toString('hex')}`,
      name: 'Google Analytics',
      meta: { properties },
      ...secrets,
    },
  })
  return back('ga=pick')
}
