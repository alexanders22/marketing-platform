import { NextResponse, type NextRequest } from 'next/server'
import { NEXT_COOKIE, checkAuthorize } from '@/lib/oauth'
import { getSessionUser } from '@/lib/session'
import { terminalUrl } from '@/lib/hosts'

// Start of the OAuth flow. Not signed in → log in first and come back to
// the consent page; signed in → straight to it.
// An invalid request gets an error page, never a redirect: anyone can
// register a client with any redirect_uri, so bouncing errors there would make
// this an open redirect (RFC 9700 §4.11.2). The user reaches the app's address
// only from the consent page, after seeing where it goes.
export async function GET(req: NextRequest) {
  const q = Object.fromEntries(req.nextUrl.searchParams)
  const check = await checkAuthorize(q)
  if (check.error) return new Response(`Loudpilot could not start the connection: ${check.error}`, { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  const consent = `/oauth/consent?${req.nextUrl.searchParams.toString()}`
  if (await getSessionUser()) return NextResponse.redirect(new URL(consent, terminalUrl()))
  const res = NextResponse.redirect(new URL('/login', terminalUrl()))
  res.cookies.set(NEXT_COOKIE, consent, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 900 })
  return res
}
