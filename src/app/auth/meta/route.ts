import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireContext } from '@/lib/context'
import { metaAuthUrl, metaEnabled } from '@/lib/meta'

// Start "Connect Facebook & Instagram" for the current workspace.
export async function GET(req: Request) {
  const { role } = await requireContext()
  if (!metaEnabled()) return NextResponse.redirect(new URL('/app/channels?error=meta-off', req.url))
  if (role === 'EDITOR') return NextResponse.redirect(new URL('/app/channels?error=role', req.url))

  const state = randomBytes(16).toString('base64url')
  const res = NextResponse.redirect(metaAuthUrl(state))
  res.cookies.set('khma_meta_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/meta',
    maxAge: 600,
  })
  return res
}
