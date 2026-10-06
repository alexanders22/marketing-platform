import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requireContext } from '@/lib/context'
import { GA_STATE_COOKIE, SC_SCOPE, gaAuthUrl, gaEnabled } from '@/lib/ga'
import { terminalUrl } from '@/lib/hosts'
import { seal } from '@/lib/signed'

// Connect Google Analytics (or, with ?product=search-console, Search
// Console): to Google for read-only access, back to the callback with the
// workspace sealed in a cookie.
export async function GET(req: NextRequest) {
  const { workspace, role } = await requireContext()
  const sc = req.nextUrl.searchParams.get('product') === 'search-console'
  const home = sc ? '/app/website' : '/app/channels'
  if (!gaEnabled()) return NextResponse.redirect(new URL(`${home}?error=ga-off`, terminalUrl()))
  if (role === 'EDITOR') return NextResponse.redirect(new URL(`${home}?error=role`, terminalUrl()))
  const state = randomBytes(16).toString('base64url')
  const res = NextResponse.redirect(sc ? gaAuthUrl(state, SC_SCOPE) : gaAuthUrl(state))
  res.cookies.set(GA_STATE_COOKIE, seal({ s: state, ws: workspace.id, ...(sc ? { p: 'sc' } : {}) }, 900), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/google-analytics',
    maxAge: 900,
  })
  return res
}
