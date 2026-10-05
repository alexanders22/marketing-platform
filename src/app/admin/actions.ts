'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { CreditReason, MemberRole } from '@prisma/client'
import { logAdmin, requireSuperAdmin } from '@/lib/admin'
import { bookPayment } from '@/lib/billing'
import { WORKSPACE_COOKIE } from '@/lib/context'
import { forgetPricing } from '@/lib/credits'
import { prisma } from '@/lib/prisma'
import { ACTION_KEYS, VEO_PLANS, type Pricing } from '@/lib/pricing'

export type AdminState = { ok?: string; error?: string } | undefined

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

/* ─── Companies (accounts) ─────────────────────────────────────────────── */

const AccountForm = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  email: z.email('Enter a valid email'),
  country: z.string().max(60),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency is a 3-letter code like GEL'),
  plan: z.enum(['NONE', 'STARTER', 'TEAM', 'AGENCY']),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']),
  trialEndsAt: z.string(),
  alertEmails: z.boolean(),
})

export async function updateAccount(accountId: string, _: AdminState, f: FormData): Promise<AdminState> {
  const admin = await requireSuperAdmin()
  const parsed = AccountForm.safeParse({
    name: text(f, 'name'),
    email: text(f, 'email').toLowerCase(),
    country: text(f, 'country'),
    currency: text(f, 'currency').toUpperCase(),
    plan: text(f, 'plan'),
    billingCycle: text(f, 'billingCycle'),
    trialEndsAt: text(f, 'trialEndsAt'),
    alertEmails: f.get('alertEmails') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const trialEndsAt = d.trialEndsAt ? new Date(`${d.trialEndsAt}T23:59:59Z`) : null
  if (trialEndsAt && Number.isNaN(trialEndsAt.getTime())) return { error: 'Trial end is not a valid date' }
  await prisma.account.update({
    where: { id: accountId },
    data: { name: d.name, email: d.email, country: d.country || null, currency: d.currency, plan: d.plan, billingCycle: d.billingCycle, trialEndsAt, alertEmails: d.alertEmails },
  })
  await logAdmin(admin, 'account.update', 'account', accountId, { ...d })
  revalidatePath(`/admin/companies/${accountId}`)
  return { ok: 'Saved' }
}

const CreditForm = z.object({
  amount: z.coerce.number().int('Whole credits only').refine((n) => n !== 0, 'Amount can not be 0'),
  reason: z.enum(['GRANT', 'PURCHASE', 'REFUND', 'ADJUSTMENT']),
  note: z.string().min(1, 'Add a note: why the change').max(200),
  key: z.string().min(8),
})

// Manual top-up, bonus or correction. The form carries a one-time key, so a
// double click or a resubmit books once.
export async function adjustCredits(accountId: string, _: AdminState, f: FormData): Promise<AdminState> {
  const admin = await requireSuperAdmin()
  const parsed = CreditForm.safeParse({ amount: text(f, 'amount'), reason: text(f, 'reason'), note: text(f, 'note'), key: text(f, 'key') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { amount, reason, note, key } = parsed.data
  const idempotencyKey = `admin:${key}`
  try {
    await prisma.$transaction(async (tx) => {
      if (await tx.creditEntry.findUnique({ where: { idempotencyKey }, select: { id: true } })) throw new Done()
      const res = await tx.account.updateMany({
        where: { id: accountId, ...(amount < 0 ? { creditBalance: { gte: -amount } } : {}) },
        data: { creditBalance: { increment: amount } },
      })
      if (res.count === 0) throw new Refused()
      await tx.creditEntry.create({
        data: { accountId, amount, reason: reason as CreditReason, note: `${note} (by ${admin.email})`, idempotencyKey, refType: 'admin', refId: admin.id },
      })
    })
  } catch (e) {
    if (e instanceof Done) return { ok: 'Already booked' }
    if (e instanceof Refused) return { error: 'The balance can not go below zero' }
    throw e
  }
  await logAdmin(admin, 'credits.adjust', 'account', accountId, { amount, reason, note })
  revalidatePath(`/admin/companies/${accountId}`)
  return { ok: `${amount > 0 ? '+' : ''}${amount} credits booked` }
}
class Done extends Error {}
class Refused extends Error {}

const PaymentForm = z.object({
  periods: z.coerce.number().int().min(1, 'At least one period').max(24),
  cycle: z.enum(['MONTHLY', 'YEARLY']),
  note: z.string().min(1, 'Add a note: how it was paid').max(200),
  key: z.string().min(8),
})

// A payment received outside the app (bank transfer, invoice): extends the
// paid period and grants this month's plan credits. One booking per form key.
export async function recordPayment(accountId: string, _: AdminState, f: FormData): Promise<AdminState> {
  const admin = await requireSuperAdmin()
  const parsed = PaymentForm.safeParse({ periods: text(f, 'periods'), cycle: text(f, 'cycle'), note: text(f, 'note'), key: text(f, 'key') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { periods, cycle, note, key } = parsed.data
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { plan: true } })
  if (!account) return { error: 'Account not found' }
  if (account.plan === 'NONE') return { error: 'Pick a plan for this account first' }
  const booked = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${'payment:' + key}))`
    return tx.adminLog.findFirst({ where: { action: 'payment.record', details: { path: ['key'], equals: key } }, select: { id: true } })
  })
  if (booked) return { ok: 'Already booked' }
  const { paidUntil, granted } = await bookPayment(accountId, periods, cycle)
  await logAdmin(admin, 'payment.record', 'account', accountId, { key, periods, cycle, note, paidUntil: paidUntil.toISOString(), granted })
  revalidatePath(`/admin/companies/${accountId}`)
  return { ok: `Paid until ${paidUntil.toISOString().slice(0, 10)}${granted ? ` · +${granted} credits` : ''}` }
}

export async function pauseAccount(accountId: string, _: AdminState, f: FormData): Promise<AdminState> {
  const admin = await requireSuperAdmin()
  const reason = text(f, 'reason').slice(0, 300) || null
  await prisma.account.update({ where: { id: accountId }, data: { pausedAt: new Date(), pausedReason: reason } })
  await logAdmin(admin, 'account.pause', 'account', accountId, { reason })
  revalidatePath(`/admin/companies/${accountId}`)
  return { ok: 'Paused' }
}

export async function resumeAccount(accountId: string) {
  const admin = await requireSuperAdmin()
  await prisma.account.update({ where: { id: accountId }, data: { pausedAt: null, pausedReason: null } })
  await logAdmin(admin, 'account.resume', 'account', accountId)
  revalidatePath(`/admin/companies/${accountId}`)
}

// Deletes the account, all its companies and everything in them. Users stay;
// those left without a company start onboarding again.
export async function deleteAccount(accountId: string, _: AdminState, f: FormData): Promise<AdminState> {
  const admin = await requireSuperAdmin()
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { name: true } })
  if (!account) redirect('/admin/companies')
  if (text(f, 'confirm') !== account.name) return { error: `Type “${account.name}” to confirm` }
  await prisma.$transaction(async (tx) => {
    await tx.workspace.deleteMany({ where: { accountId } })
    await tx.account.delete({ where: { id: accountId } })
  })
  await logAdmin(admin, 'account.delete', 'account', accountId, { name: account.name })
  redirect('/admin/companies?deleted=1')
}

/* ─── Workspaces ───────────────────────────────────────────────────────── */

export async function renameWorkspace(workspaceId: string, _: AdminState, f: FormData): Promise<AdminState> {
  const admin = await requireSuperAdmin()
  const name = text(f, 'name').slice(0, 120)
  if (!name) return { error: 'Name is required' }
  const ws = await prisma.workspace.update({ where: { id: workspaceId }, data: { name }, select: { accountId: true } })
  await logAdmin(admin, 'workspace.rename', 'workspace', workspaceId, { name })
  revalidatePath(`/admin/companies/${ws.accountId}`)
  return { ok: 'Renamed' }
}

export async function deleteWorkspace(workspaceId: string, _: AdminState, f: FormData): Promise<AdminState> {
  const admin = await requireSuperAdmin()
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, accountId: true } })
  if (!ws) return { error: 'Already deleted' }
  if (text(f, 'confirm') !== ws.name) return { error: `Type “${ws.name}” to confirm` }
  await prisma.workspace.delete({ where: { id: workspaceId } })
  await logAdmin(admin, 'workspace.delete', 'workspace', workspaceId, { name: ws.name, accountId: ws.accountId })
  revalidatePath(`/admin/companies/${ws.accountId}`)
  return { ok: 'Deleted' }
}

// Open a company in the app as its owner would see it.
export async function openWorkspace(workspaceId: string) {
  const admin = await requireSuperAdmin()
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { accountId: true } })
  if (!ws?.accountId) return
  ;(await cookies()).set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
  await logAdmin(admin, 'workspace.open', 'workspace', workspaceId)
  redirect('/app/dashboard')
}

/* ─── Members ──────────────────────────────────────────────────────────── */

const ROLES = ['OWNER', 'ADMIN', 'EDITOR'] as const

export async function addMember(accountId: string, _: AdminState, f: FormData): Promise<AdminState> {
  const admin = await requireSuperAdmin()
  const email = text(f, 'email').toLowerCase()
  const role = text(f, 'role') as MemberRole
  if (!ROLES.includes(role as (typeof ROLES)[number])) return { error: 'Pick a role' }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) return { error: 'No user with that email. They need to sign up first.' }
  const exists = await prisma.accountMember.findUnique({ where: { accountId_userId: { accountId, userId: user.id } } })
  if (exists) return { error: 'Already a member' }
  await prisma.accountMember.create({ data: { accountId, userId: user.id, role } })
  await logAdmin(admin, 'member.add', 'account', accountId, { email, role })
  revalidatePath(`/admin/companies/${accountId}`)
  return { ok: 'Member added' }
}

export async function setMemberRole(memberId: string, role: MemberRole) {
  const admin = await requireSuperAdmin()
  if (!ROLES.includes(role as (typeof ROLES)[number])) return
  const m = await prisma.accountMember.update({ where: { id: memberId }, data: { role } })
  await logAdmin(admin, 'member.role', 'member', memberId, { role, accountId: m.accountId })
  revalidatePath(`/admin/companies/${m.accountId}`)
}

export async function removeMember(memberId: string) {
  const admin = await requireSuperAdmin()
  const m = await prisma.accountMember.delete({ where: { id: memberId } })
  await logAdmin(admin, 'member.remove', 'member', memberId, { accountId: m.accountId, userId: m.userId })
  revalidatePath(`/admin/companies/${m.accountId}`)
}

/* ─── Users ────────────────────────────────────────────────────────────── */

const UserForm = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  email: z.email('Enter a valid email'),
  role: z.enum(['USER', 'SUPER_ADMIN']),
})

export async function updateUser(userId: string, _: AdminState, f: FormData): Promise<AdminState> {
  const admin = await requireSuperAdmin()
  const parsed = UserForm.safeParse({ name: text(f, 'name'), email: text(f, 'email').toLowerCase(), role: text(f, 'role') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  if (userId === admin.id && d.role !== 'SUPER_ADMIN') return { error: 'You can not remove your own super admin role' }
  const clash = await prisma.user.findFirst({ where: { email: d.email, id: { not: userId } }, select: { id: true } })
  if (clash) return { error: 'Another user already has that email' }
  await prisma.user.update({ where: { id: userId }, data: d })
  await logAdmin(admin, 'user.update', 'user', userId, d)
  revalidatePath(`/admin/users/${userId}`)
  return { ok: 'Saved' }
}

// Blocking ends every session and token at once.
export async function blockUser(userId: string) {
  const admin = await requireSuperAdmin()
  if (userId === admin.id) return
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { disabledAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.accessToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ])
  await logAdmin(admin, 'user.block', 'user', userId)
  revalidatePath(`/admin/users/${userId}`)
}

export async function unblockUser(userId: string) {
  const admin = await requireSuperAdmin()
  await prisma.user.update({ where: { id: userId }, data: { disabledAt: null } })
  await logAdmin(admin, 'user.unblock', 'user', userId)
  revalidatePath(`/admin/users/${userId}`)
}

export async function signOutUser(userId: string) {
  const admin = await requireSuperAdmin()
  const { count } = await prisma.session.deleteMany({ where: { userId } })
  await logAdmin(admin, 'user.signout', 'user', userId, { sessions: count })
  revalidatePath(`/admin/users/${userId}`)
}

export async function deleteUser(userId: string, _: AdminState, f: FormData): Promise<AdminState> {
  const admin = await requireSuperAdmin()
  if (userId === admin.id) return { error: 'You can not delete yourself' }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (!user) redirect('/admin/users')
  if (text(f, 'confirm') !== user.email) return { error: `Type “${user.email}” to confirm` }
  await prisma.user.delete({ where: { id: userId } })
  await logAdmin(admin, 'user.delete', 'user', userId, { email: user.email })
  redirect('/admin/users?deleted=1')
}

/* ─── Pricing ──────────────────────────────────────────────────────────── */

// Credits per action and provider cost; applies to new charges at once.
export async function savePricing(input: Pricing): Promise<AdminState> {
  const admin = await requireSuperAdmin()
  const price = Number(input.creditPriceUsd)
  if (!Number.isFinite(price) || price <= 0 || price > 100) return { error: 'Credit price must be between $0 and $100' }
  const actions = {} as Pricing['actions']
  for (const k of ACTION_KEYS) {
    const a = input.actions?.[k]
    const credits = Number(a?.credits)
    const costUsd = Number(a?.costUsd)
    if (!Number.isInteger(credits) || credits < 0 || credits > 10_000) return { error: `Credits for ${k} must be a whole number from 0` }
    if (!Number.isFinite(costUsd) || costUsd < 0 || costUsd > 1000) return { error: `Cost for ${k} must be from $0` }
    actions[k] = { credits, costUsd }
  }
  const veoSecondsPerMonth = {} as Pricing['veoSecondsPerMonth']
  for (const pl of VEO_PLANS) {
    const n = Number(input.veoSecondsPerMonth?.[pl])
    if (!Number.isInteger(n) || n < 0 || n > 100_000) return { error: `Veo limit for ${pl} must be a whole number of seconds` }
    veoSecondsPerMonth[pl] = n
  }
  const value: Pricing = { creditPriceUsd: price, actions, veoSecondsPerMonth }
  await prisma.setting.upsert({
    where: { key: 'pricing' },
    create: { key: 'pricing', value, updatedBy: admin.email },
    update: { value, updatedBy: admin.email },
  })
  forgetPricing()
  await logAdmin(admin, 'pricing.update', 'setting', 'pricing', value)
  revalidatePath('/admin/pricing')
  revalidatePath('/app', 'layout')
  return { ok: 'Saved — new prices apply to the next charge' }
}
