'use server'

import { randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { sha256 } from '@/lib/crypto'
import { actionEmail, appUrl, mailEnabled, sendMail } from '@/lib/mail'
import { hashPassword, verifyPassword } from '@/lib/password'
import { createSession, destroySession } from '@/lib/session'

export type FormState = { error?: string; sent?: string; fields?: Record<string, string> } | undefined

const Email = z.email('Enter a valid email').transform((e) => e.trim().toLowerCase())
const LINK_TTL_MS = 15 * 60 * 1000
const RESET_TTL_MS = 30 * 60 * 1000

// Same answer whether or not the email has an account, so the form cannot be
// used to find out who is registered. Signing in through the link creates the
// user if needed.
export async function requestMagicLink(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Email.safeParse(form.get('email'))
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { email: String(form.get('email') ?? '') } }
  const email = parsed.data

  if (await recentlySent(email, 'LOGIN')) return { sent: email }

  const link = `${appUrl()}/auth/magic?token=${await issueLink(email, 'LOGIN', LINK_TTL_MS)}`
  const footer = 'The link works once and expires in 15 minutes. If you did not ask for it, ignore this email.'
  try {
    await sendMail(
      email,
      'Your Khma sign-in link',
      `Sign in to Khma: ${link}\n\n${footer}`,
      actionEmail('Click the button below to sign in to Khma.', 'Sign in', link, footer),
    )
  } catch (e) {
    console.error('magic link mail failed', e)
    return { error: "We couldn't send the email right now. Please try again in a minute.", fields: { email } }
  }
  return { sent: email }
}

// One email per minute per address and purpose.
async function recentlySent(email: string, purpose: 'LOGIN' | 'PASSWORD_RESET') {
  return Boolean(
    await prisma.magicLink.findFirst({
      where: { email, purpose, createdAt: { gt: new Date(Date.now() - 60_000) } },
      select: { id: true },
    }),
  )
}

async function issueLink(email: string, purpose: 'LOGIN' | 'PASSWORD_RESET', ttlMs: number) {
  const token = randomBytes(32).toString('base64url')
  await prisma.magicLink.create({
    data: { email, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
  })
  return token
}

// Marks a link used exactly once; null if it is unknown, used, expired or
// meant for something else.
async function claimLink(token: string, purpose: 'LOGIN' | 'PASSWORD_RESET') {
  if (!token) return null
  const link = await prisma.magicLink.findUnique({ where: { tokenHash: sha256(token) } })
  if (!link || link.purpose !== purpose || link.usedAt || link.expiresAt < new Date()) return null
  const claimed = await prisma.magicLink.updateMany({ where: { id: link.id, usedAt: null }, data: { usedAt: new Date() } })
  return claimed.count === 1 ? link : null
}

// Called from the confirmation page (a POST, so mail scanners that open
// links do not burn the token).
export async function consumeMagicLink(form: FormData) {
  const link = await claimLink(String(form.get('token') ?? ''), 'LOGIN')
  if (!link) redirect('/login?error=link')

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

// Same answer whether or not the email has an account. Users who signed up
// with a magic link or Google can use this to set a first password.
export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Email.safeParse(form.get('email'))
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { email: String(form.get('email') ?? '') } }
  const email = parsed.data
  if (!mailEnabled()) return { error: 'Password reset by email is not available yet.' }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (user && !(await recentlySent(email, 'PASSWORD_RESET'))) {
    const link = `${appUrl()}/reset-password?token=${await issueLink(email, 'PASSWORD_RESET', RESET_TTL_MS)}`
    const footer = 'The link works once and expires in 30 minutes. If you did not ask to reset your password, ignore this email — your password stays the same.'
    try {
      await sendMail(
        email,
        'Reset your Khma password',
        `Set a new Khma password: ${link}\n\n${footer}`,
        actionEmail('Click the button below to choose a new password for your Khma account.', 'Set new password', link, footer),
      )
    } catch (e) {
      console.error('reset mail failed', e)
      return { error: "We couldn't send the email right now. Please try again in a minute.", fields: { email } }
    }
  }
  return { sent: email }
}

const NewPassword = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  confirm: z.string(),
})

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = NewPassword.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  if (parsed.data.password !== parsed.data.confirm) return { error: "Passwords don't match" }

  const link = await claimLink(parsed.data.token, 'PASSWORD_RESET')
  if (!link) return { error: 'This reset link is invalid or has expired. Request a new one.' }
  const user = await prisma.user.findUnique({ where: { email: link.email } })
  if (!user) return { error: 'This reset link is invalid or has expired. Request a new one.' }

  // New password signs out every other device.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.password), emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ])
  await createSession(user.id)
  redirect('/app')
}

export async function logout() {
  await destroySession()
  redirect('/login')
}
