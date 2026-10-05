import { NextResponse, type NextRequest } from 'next/server'
import { crossHost, siteUrl } from '@/lib/hosts'

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  // Site pages on the site host, product pages on the terminal host.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const elsewhere = crossHost(host, path, siteUrl(), process.env.TERMINAL_URL)
  if (elsewhere) return NextResponse.redirect(elsewhere + req.nextUrl.search)

  // The landing in the language picked last time.
  if (path === '/') {
    const lang = req.cookies.get('lp_lang')?.value
    if (lang === 'ka' || lang === 'ru') return NextResponse.redirect(new URL(`/${lang}`, req.url))
    return NextResponse.next()
  }
  // Optimistic check only: no cookie → straight to login. The real session
  // validation happens server-side in requireUser().
  if ((path === '/app' || path.startsWith('/app/')) && !req.cookies.has('khma_session')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/app/:path*',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/onboarding/:path*',
    '/admin/:path*',
    '/paused',
    '/auth/:path*',
    '/connect/:path*',
    '/oauth/authorize',
    '/oauth/consent',
    '/ka/:path*',
    '/ru/:path*',
    '/features/:path*',
    '/docs/:path*',
    '/privacy',
    '/terms',
    '/data-deletion',
    '/b/:path*',
  ],
}
