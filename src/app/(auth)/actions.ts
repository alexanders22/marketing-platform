'use server'

import { randomBytes } from 'node:crypto'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { revokeUserTokens } from '@/lib/access-tokens'
import { sha256 } from '@/lib/crypto'
import { clientIp as ipOf } from '@/lib/client-ip'
import { actionEmail, mailEnabled, sendMail } from '@/lib/mail'
import { terminalUrl } from '@/lib/hosts'
import { DUMMY_HASH, hashPassword, needsRehash, verifyPassword } from '@/lib/password'
import { clearFailures, isLimited, overLimit, recordFailure } from '@/lib/rate-limit'
import { createSession, destroySession, afterLoginPath } from '@/lib/session'

export type FormState = { error?: string; sent?: string; fields?: Record<string, string> } | undefined

const Email = z.email('Enter a valid email').transform((e) => e.trim().toLowerCase())
const LINK_TTL_MS = 15 * 60 * 1000
const RESET_TTL_MS = 30 * 60 * 1000
// Sign-in and reset emails per IP and hour, so a script can't mail-bomb a
// list of addresses (each address already gets at most one a minute).
// KHMA_MAILS_PER_IP_HOUR raises it for e2e runs, which sign up hundreds of
// users from one machine.
const MAILS_PER_IP_HOUR = Number(process.env.KHMA_MAILS_PER_IP_HOUR) || 20
const TOO_MANY_MAILS = 'Too many emails were requested from your network. Try again in an hour.'
const mailLimited = async () => overLimit(`auth-mail:${await clientIp()}`, MAILS_PER_IP_HOUR, 3_600_000)

// Same answer whether or not the email has an account, so the form cannot be
// used to find out who is registered. Signing in through the link creates the
// user if needed.
export async function requestMagicLink(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Email.safeParse(form.get('email'))
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { email: String(form.get('email') ?? '') } }
  const email = parsed.data

  if (await recentlySent(email, 'LOGIN')) return { sent: email }
  if (await mailLimited()) return { error: TOO_MANY_MAILS, fields: { email } }

  const link = `${terminalUrl()}/auth/magic?token=${await issueLink(email, 'LOGIN', LINK_TTL_MS)}`
  const footer = 'The link works once and expires in 15 minutes. If you did not ask for it, ignore this email.'
  try {
    await sendMail(
      email,
      'Your Loudpilot sign-in link',
      `Sign in to Loudpilot: ${link}\n\n${footer}`,
      actionEmail('Click the button below to sign in to Loudpilot.', 'Sign in', link, footer),
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

  const existing = await prisma.user.findUnique({ where: { email: link.email } })
  const user = existing
    ? await verifyEmailOwner(existing.id, existing.emailVerifiedAt)
    : await prisma.user.create({ data: { email: link.email, name: link.email.split('@')[0], emailVerifiedAt: new Date() } })
  await createSession(user.id)
  redirect(await afterLoginPath())
}

// First proof of email ownership for an account that was created without it
// (password signup while mail was off): whoever set that password may not be
// the owner, so drop the password and any sessions and MCP/AI app tokens it opened.
async function verifyEmailOwner(userId: string, verifiedAt: Date | null) {
  if (verifiedAt) return prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date(), passwordHash: null } }),
    prisma.session.deleteMany({ where: { userId } }),
    revokeUserTokens(userId),
  ])
  return user
}

const PasswordLogin = z.object({ email: Email, password: z.string().min(1) })

// Brute-force guard: 10 failures per email or 50 per IP in 15 minutes.
const LOGIN_WINDOW = 15 * 60 * 1000
async function clientIp() {
  const h = await headers()
  return ipOf(h) ?? 'unknown'
}

export async function passwordLogin(_: FormState, form: FormData): Promise<FormState> {
  const raw = Object.fromEntries(form) as Record<string, string>
  const parsed = PasswordLogin.safeParse(raw)
  const invalid = { error: 'Wrong email or password', fields: { email: raw.email ?? '' } }
  if (!parsed.success) return invalid

  const emailKey = `login:${parsed.data.email}`
  const ipKey = `login-ip:${await clientIp()}`
  if (isLimited(emailKey, 10) || isLimited(ipKey, 50)) {
    return { error: 'Too many attempts. Wait 15 minutes or reset your password.', fields: { email: raw.email ?? '' } }
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  // Verify even when the user is missing so timing does not reveal which emails exist.
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !ok) {
    recordFailure(emailKey, LOGIN_WINDOW)
    recordFailure(ipKey, LOGIN_WINDOW)
    return invalid
  }

  clearFailures(emailKey)
  // Hashes made with older, weaker parameters are upgraded while the password is at hand.
  if (needsRehash(user.passwordHash!)) {
    await prisma.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash }, data: { passwordHash: await hashPassword(parsed.data.password) } })
  }
  await createSession(user.id)
  redirect(await afterLoginPath())
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
  redirect(await afterLoginPath())
}

// Same answer whether or not the email has an account. Users who signed up
// with a magic link or Google can use this to set a first password.
export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Email.safeParse(form.get('email'))
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { email: String(form.get('email') ?? '') } }
  const email = parsed.data
  if (!mailEnabled()) return { error: 'Password reset by email is not available yet.' }
  // Counted for every request, known email or not, so the limit reveals nothing.
  if (await mailLimited()) return { error: TOO_MANY_MAILS, fields: { email } }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (user && !(await recentlySent(email, 'PASSWORD_RESET'))) {
    const link = `${terminalUrl()}/reset-password?token=${await issueLink(email, 'PASSWORD_RESET', RESET_TTL_MS)}`
    const footer = 'The link works once and expires in 30 minutes. If you did not ask to reset your password, ignore this email — your password stays the same.'
    // Not awaited: answering at the same speed for known and unknown emails
    // keeps response time from revealing who has an account.
    sendMail(
      email,
      'Reset your Loudpilot password',
      `Set a new Loudpilot password: ${link}\n\n${footer}`,
      actionEmail('Click the button below to choose a new password for your Loudpilot account.', 'Set new password', link, footer),
    ).catch((e) => console.error('reset mail failed', e))
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

  // New password signs out every other device, cuts off personal tokens and
  // AI apps, and voids any other pending sign-in or reset links for this email.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.password), emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    revokeUserTokens(user.id),
    prisma.magicLink.updateMany({ where: { email: link.email, usedAt: null }, data: { usedAt: new Date() } }),
  ])
  clearFailures(`login:${link.email}`)
  await createSession(user.id)
  redirect(await afterLoginPath())
}

export async function logout() {
  await destroySession()
  redirect('/login')
}
