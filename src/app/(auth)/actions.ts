'use server'

import { randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { sha256 } from '@/lib/crypto'
import { appUrl, mailEnabled, sendMail } from '@/lib/mail'
import { hashPassword, verifyPassword } from '@/lib/password'
import { createSession, destroySession } from '@/lib/session'

export type FormState = { error?: string; sent?: string; fields?: Record<string, string> } | undefined

const Email = z.email('Enter a valid email').transform((e) => e.trim().toLowerCase())
const LINK_TTL_MS = 15 * 60 * 1000

// Same answer whether or not the email has an account, so the form cannot be
// used to find out who is registered. Signing in through the link creates the
// user if needed.
export async function requestMagicLink(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Email.safeParse(form.get('email'))
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { email: String(form.get('email') ?? '') } }
  const email = parsed.data

  const recent = await prisma.magicLink.findFirst({
    where: { email, createdAt: { gt: new Date(Date.now() - 60_000) } },
    select: { id: true },
  })
  if (recent) return { sent: email }

  const token = randomBytes(32).toString('base64url')
  await prisma.magicLink.create({
    data: { email, tokenHash: sha256(token), expiresAt: new Date(Date.now() + LINK_TTL_MS) },
  })
  const link = `${appUrl()}/auth/magic?token=${token}`
  await sendMail(
    email,
    'Your Khma sign-in link',
    `Sign in to Khma: ${link}\n\nThe link works once and expires in 15 minutes. If you did not ask for it, ignore this email.`,
    `<p>Click to sign in to Khma:</p><p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#18181b;color:#fff;border-radius:8px;text-decoration:none">Sign in</a></p><p style="color:#71717a;font-size:13px">The link works once and expires in 15 minutes. If you did not ask for it, ignore this email.</p>`,
  )
  return { sent: email }
}

// Called from the confirmation page (a POST, so mail scanners that open
// links do not burn the token).
export async function consumeMagicLink(form: FormData) {
  const token = String(form.get('token') ?? '')
  if (!token) redirect('/login?error=link')
  const link = await prisma.magicLink.findUnique({ where: { tokenHash: sha256(token) } })
  if (!link || link.usedAt || link.expiresAt < new Date()) redirect('/login?error=link')

  const claimed = await prisma.magicLink.updateMany({
    where: { id: link.id, usedAt: null },
    data: { usedAt: new Date() },
  })
  if (claimed.count === 0) redirect('/login?error=link')

  const user = await prisma.user.upsert({
    where: { email: link.email },
    create: { email: link.email, name: link.email.split('@')[0], emailVerifiedAt: new Date() },
    update: { emailVerifiedAt: new Date() },
  })
  await createSession(user.id)
  redirect('/app')
}

const PasswordLogin = z.object({ email: Email, password: z.string().min(1) })

export async function passwordLogin(_: FormState, form: FormData): Promise<FormState> {
  const raw = Object.fromEntries(form) as Record<string, string>
  const parsed = PasswordLogin.safeParse(raw)
  const invalid = { error: 'Wrong email or password', fields: { email: raw.email ?? '' } }
  if (!parsed.success) return invalid

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  // Verify even when the user is missing so timing does not reveal which emails exist.
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? 'scrypt$AAAA$AAAA')
  if (!user || !ok) return invalid

  await createSession(user.id)
  redirect('/app')
}

const PasswordSignup = z.object({
  email: Email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
})

// Fallback while outgoing mail is not configured.
export async function passwordSignup(_: FormState, form: FormData): Promise<FormState> {
  if (mailEnabled()) return { error: 'Use the email link to sign up' }
  const raw = Object.fromEntries(form) as Record<string, string>
  const parsed = PasswordSignup.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { email: raw.email ?? '' } }
  const { email, password } = parsed.data

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return { error: 'An account with this email already exists — log in instead', fields: { email } }
  }
  const user = await prisma.user.create({
    data: { email, name: email.split('@')[0], passwordHash: await hashPassword(password) },
  })
  await createSession(user.id)
  redirect('/app')
}

export async function logout() {
  await destroySession()
  redirect('/login')
}
