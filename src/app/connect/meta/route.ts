import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { META_STATE_COOKIE, metaAuthUrl, metaEnabled } from '@/lib/meta'
import { prisma } from '@/lib/prisma'
import { seal, unseal } from '@/lib/signed'

// Connect link made by a partner through the API: no Loudpilot login needed. The
// partner's customer lands here, signs in to Facebook, and is sent back to
// the partner's returnUrl.
export async function GET(req: NextRequest) {
  const link = unseal<{ ws: string; ret: string }>(req.nextUrl.searchParams.get('token'))
  if (!link) return new Response('This connect link has expired. Please start again from the app you came from.', { status: 410 })
  const back = (q: string) => NextResponse.redirect(`${link.ret}${link.ret.includes('?') ? '&' : '?'}${q}`)
  if (!metaEnabled()) return back('loudpilot_status=error&loudpilot_reason=not_configured')
  const ws = await prisma.workspace.findUnique({ where: { id: link.ws }, select: { id: true } })
  if (!ws) return back('loudpilot_status=error&loudpilot_reason=workspace_not_found')

  const state = randomBytes(16).toString('base64url')
  const res = NextResponse.redirect(metaAuthUrl(state))
  res.cookies.set(META_STATE_COOKIE, seal({ s: state, ws: link.ws, ret: link.ret }, 900), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/meta',
    maxAge: 900,
  })
  return res
}
