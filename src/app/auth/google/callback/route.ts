import { NextResponse, type NextRequest } from 'next/server'
import { exchangeGoogleCode, googleEnabled } from '@/lib/google'
import { prisma } from '@/lib/prisma'
import { afterLoginPath, createSession } from '@/lib/session'
import { appUrl } from '@/lib/mail'

export async function GET(req: NextRequest) {
  const fail = () => NextResponse.redirect(new URL('/login?error=google', appUrl()))
  if (!googleEnabled()) return fail()

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const expected = req.cookies.get('khma_oauth_state')?.value
  if (!code || !state || !expected || state !== expected) return fail()

  let profile
  try {
    profile = await exchangeGoogleCode(code)
  } catch (e) {
    console.error(e)
    return fail()
  }

  // Link by Google id first, then by verified email.
  const existing =
    (await prisma.user.findUnique({ where: { googleId: profile.sub } })) ??
    (await prisma.user.findUnique({ where: { email: profile.email } }))
  // First verified sign-in for an account created without email proof: drop
  // the unverified password and its sessions (account pre-hijacking).
  const firstProof = existing && !existing.emailVerifiedAt
  if (firstProof) await prisma.session.deleteMany({ where: { userId: existing.id } })
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          googleId: profile.sub,
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          ...(firstProof ? { passwordHash: null } : {}),
        },
      })
    : await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name || profile.email.split('@')[0],
          googleId: profile.sub,
          emailVerifiedAt: new Date(),
        },
      })

  await createSession(user.id)
  const res = NextResponse.redirect(new URL(await afterLoginPath(), appUrl()))
  res.cookies.delete({ name: 'khma_oauth_state', path: '/auth/google' })
  return res
}
