'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashPassword, verifyPassword } from '@/lib/password'
import { createSession, destroySession } from '@/lib/session'

export type FormState = { error?: string; fields?: Record<string, string> } | undefined

const Signup = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  brand: z.string().trim().min(1, 'Enter your brand or company name').max(120),
  email: z.email('Enter a valid email').transform((e) => e.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  terms: z.literal('on', { error: 'Please accept the terms to continue' }),
})

// Direct signup: one user, one paying account, one workspace for the brand.
export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const raw = Object.fromEntries(form) as Record<string, string>
  const parsed = Signup.safeParse(raw)
  const fields = { name: raw.name ?? '', brand: raw.brand ?? '', email: raw.email ?? '' }
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields }
  const input = parsed.data

  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    return { error: 'An account with this email already exists — log in instead', fields }
  }

  const passwordHash = await hashPassword(input.password)
  const user = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash } })
    const account = await tx.account.create({
      data: { name: input.brand, email: input.email, termsAcceptedAt: new Date() },
    })
    await tx.accountMember.create({ data: { accountId: account.id, userId: user.id, role: 'OWNER' } })
    await tx.workspace.create({ data: { name: input.brand, accountId: account.id, locale: 'en' } })
    return user
  })

  await createSession(user.id)
  redirect('/app')
}

const Login = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
})

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const raw = Object.fromEntries(form) as Record<string, string>
  const parsed = Login.safeParse(raw)
  const fields = { email: raw.email ?? '' }
  const invalid = { error: 'Wrong email or password', fields }
  if (!parsed.success) return invalid

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  // Verify even when the user is missing so timing does not reveal which emails exist.
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? 'scrypt$AAAA$AAAA')
  if (!user || !ok) return invalid

  await createSession(user.id)
  redirect('/app')
}

export async function logout() {
  await destroySession()
  redirect('/login')
}
