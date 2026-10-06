import { createHash, randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requireContext } from '@/lib/context'
import { terminalUrl } from '@/lib/hosts'
import { appUrl } from '@/lib/mail'
import { connectorBySlug } from '@/lib/networks'
import { CONNECT_COOKIE } from '@/lib/networks/types'
import { seal } from '@/lib/signed'

// Connect TikTok, LinkedIn, YouTube, X, Threads or Pinterest: off to the
// network's sign-in with a signed state (and a PKCE verifier) in a cookie.
export async function GET(_: NextRequest, ctx: RouteContext<'/auth/connect/[network]'>) {
  const { network } = await ctx.params
  const { workspace, role } = await requireContext()
  const back = (q: string) => NextResponse.redirect(new URL(`/app/channels?${q}`, terminalUrl()))
  const c = connectorBySlug(network)
  if (!c?.oauth || !c.enabled()) return back('error=network-off')
  if (role === 'EDITOR') return back('error=role')
  const state = randomBytes(16).toString('base64url')
  const verifier = c.oauth.pkce ? randomBytes(32).toString('base64url') : undefined
  const challenge = verifier ? createHash('sha256').update(verifier).digest('base64url') : undefined
  const res = NextResponse.redirect(c.oauth.authUrl({ state, redirectUri: `${appUrl()}/auth/connect/${network}/callback`, challenge }))
  res.cookies.set(CONNECT_COOKIE, seal({ s: state, ws: workspace.id, n: network, ...(verifier ? { v: verifier } : {}) }, 900), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/connect',
    maxAge: 900,
  })
  return res
}
