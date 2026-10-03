import { NextResponse, type NextRequest } from 'next/server'
import { NEXT_COOKIE, checkAuthorize, withQuery } from '@/lib/oauth'
import { getSessionUser } from '@/lib/session'

// Start of the OAuth flow. Not signed in → log in first and come back to
// the consent page; signed in → straight to it.
export async function GET(req: NextRequest) {
  const q = Object.fromEntries(req.nextUrl.searchParams)
  const check = await checkAuthorize(q)
  if (check.error) {
    if (check.redirect && q.redirect_uri) return NextResponse.redirect(withQuery(q.redirect_uri, { error: 'invalid_request', error_description: check.error, state: q.state }))
    return new Response(`Loudpilot could not start the connection: ${check.error}`, { status: 400 })
  }
  const consent = `/oauth/consent?${req.nextUrl.searchParams.toString()}`
  if (await getSessionUser()) return NextResponse.redirect(new URL(consent, req.url))
  const res = NextResponse.redirect(new URL('/login', req.url))
  res.cookies.set(NEXT_COOKIE, consent, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 900 })
  return res
}
