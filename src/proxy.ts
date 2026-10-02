import { NextResponse, type NextRequest } from 'next/server'

// Optimistic check only: no cookie → straight to login. The real session
// validation happens server-side in requireUser().
export function proxy(req: NextRequest) {
  if (!req.cookies.has('khma_session')) {
    const url = new URL('/login', req.url)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/app', '/app/:path*'],
}
