import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { randomBytes } from 'node:crypto'
import { prisma } from './prisma'
import { sha256 } from './crypto'

export const SESSION_COOKIE = 'khma_session'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

// A user blocked by a super admin never gets a session.
export async function createSession(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { disabledAt: true } })
  if (!user || user.disabledAt) redirect('/login?error=blocked')
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + TTL_MS)
  await prisma.session.create({ data: { userId, tokenHash: sha256(token), expiresAt } })

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function destroySession() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } })
  store.delete(SESSION_COOKIE)
  store.delete('khma_ws')
}

// One lookup per request, however many components ask.
export const getSessionUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  })
  if (!session || session.expiresAt < new Date() || session.user.disabledAt) return null
  return session.user
})

export async function requireUser() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return user
}

// Where to go after signing in: back to an OAuth consent page if one sent
// the user to log in, else the app.
export async function afterLoginPath() {
  const store = await cookies()
  const next = store.get('khma_next')?.value
  if (next) store.delete('khma_next')
  return next && next.startsWith('/oauth/consent?') ? next : '/app'
}
