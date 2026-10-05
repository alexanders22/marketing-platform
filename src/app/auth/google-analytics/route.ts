import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireContext } from '@/lib/context'
import { GA_STATE_COOKIE, gaAuthUrl, gaEnabled } from '@/lib/ga'
import { terminalUrl } from '@/lib/hosts'
import { seal } from '@/lib/signed'

// Connect Google Analytics: to Google for read-only access, back to the
// callback with the workspace sealed in a cookie.
export async function GET() {
  const { workspace, role } = await requireContext()
  if (!gaEnabled()) return NextResponse.redirect(new URL('/app/channels?error=ga-off', terminalUrl()))
  if (role === 'EDITOR') return NextResponse.redirect(new URL('/app/channels?error=role', terminalUrl()))
  const state = randomBytes(16).toString('base64url')
  const res = NextResponse.redirect(gaAuthUrl(state))
  res.cookies.set(GA_STATE_COOKIE, seal({ s: state, ws: workspace.id }, 900), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/google-analytics',
    maxAge: 900,
  })
  return res
}
