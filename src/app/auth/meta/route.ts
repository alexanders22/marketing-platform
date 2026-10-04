import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireContext } from '@/lib/context'
import { META_STATE_COOKIE, metaAuthUrl, metaEnabled } from '@/lib/meta'
import { seal } from '@/lib/signed'
import { appUrl } from '@/lib/mail'

// Start "Connect Facebook & Instagram" for the current workspace.
export async function GET(req: Request) {
  const { role } = await requireContext()
  if (!metaEnabled()) return NextResponse.redirect(new URL('/app/channels?error=meta-off', appUrl()))
  if (role === 'EDITOR') return NextResponse.redirect(new URL('/app/channels?error=role', appUrl()))

  const state = randomBytes(16).toString('base64url')
  const res = NextResponse.redirect(metaAuthUrl(state))
  res.cookies.set(META_STATE_COOKIE, seal({ s: state }, 600), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/meta',
    maxAge: 600,
  })
  return res
}
