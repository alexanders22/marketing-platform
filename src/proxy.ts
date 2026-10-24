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
  // Back from a card payment started before /pay/done existed: the browser
  // left the cookie out of the payment site's request, it is not a logout.
  // (`back` marks the second try: then it really is the login page.)
  if (path === '/app/credits' && req.nextUrl.searchParams.has('payment') && !req.nextUrl.searchParams.has('back') && !req.cookies.has('khma_session')) {
    return NextResponse.redirect(new URL(`/pay/done?payment=${encodeURIComponent(req.nextUrl.searchParams.get('payment')!)}`, req.url), 303)
  }
  // Optimistic check only: no cookie → straight to login. The real session
  // validation happens server-side in requireUser().
  if ((path === '/app' || path.startsWith('/app/') || path === '/demo-shop') && !req.cookies.has('khma_session')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  // Admin without a session: not found, before any page code runs (each admin
  // page still checks the super admin itself).
  if ((path === '/admin' || path.startsWith('/admin/')) && !req.cookies.has('khma_session')) {
    return new NextResponse(null, { status: 404 })
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
    '/demo-shop',
  ],
}
