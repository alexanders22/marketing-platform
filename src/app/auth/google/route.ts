import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { googleEnabled, googleRedirectUri } from '@/lib/google'
import { terminalUrl } from '@/lib/hosts'

export async function GET(req: Request) {
  if (!googleEnabled()) return NextResponse.redirect(new URL('/login', terminalUrl()))
  const state = randomBytes(16).toString('base64url')
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }).toString()

  const res = NextResponse.redirect(url)
  res.cookies.set('khma_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/google',
    maxAge: 600,
  })
  return res
}
