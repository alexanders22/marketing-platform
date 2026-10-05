'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { MemberRole } from '@prisma/client'
import { requireContext } from '@/lib/context'
import { sha256 } from '@/lib/crypto'
import { terminalUrl } from '@/lib/hosts'
import { actionEmail, sendMail } from '@/lib/mail'
import { prisma } from '@/lib/prisma'
import { INVITE_TTL_MS, seatLimit, seatsUsed } from '@/lib/team'

export type TeamState = { ok?: string; error?: string } | undefined

const Invite = z.object({
  email: z.email('Enter a valid email').transform((e) => e.trim().toLowerCase()),
  role: z.enum(['ADMIN', 'EDITOR']),
})

// Owners and admins manage the team; a super admin helping out may too.
async function manager() {
  const ctx = await requireContext()
  if (ctx.role === 'EDITOR' && !ctx.asAdmin) throw new Error('Only owners and admins manage the team')
  return ctx
}

export async function inviteMember(_: TeamState, f: FormData): Promise<TeamState> {
  const { user, account, asAdmin } = await manager()
  const parsed = Invite.safeParse({ email: String(f.get('email') ?? ''), role: String(f.get('role') ?? '') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { email, role } = parsed.data
  const limit = asAdmin ? Infinity : seatLimit(account.plan)
  const token = randomBytes(32).toString('base64url')

  const result = await prisma.$transaction(async (tx) => {
    // Per-account lock: two invites at once can't both take the last seat.
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${'seats:' + account.id}))`
    const member = await tx.accountMember.findFirst({ where: { accountId: account.id, user: { email } }, select: { id: true } })
    if (member) return 'member'
    // A new invite to the same address replaces the old one (resend).
    await tx.invitation.deleteMany({ where: { accountId: account.id, email, acceptedAt: null } })
    if ((await seatsUsed(account.id, tx)).used >= limit) return 'full'
    await tx.invitation.create({
      data: { accountId: account.id, email, role, tokenHash: sha256(token), invitedById: user.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    })
    return 'ok'
  })
  if (result === 'member') return { error: 'Already on the team.' }
  if (result === 'full') {
    return {
      error:
        account.plan === 'NONE'
          ? 'Choose a plan to invite teammates.'
          : `Your plan includes ${limit} user${limit === 1 ? '' : 's'}. Upgrade or remove someone to invite more.`,
    }
  }

  const link = `${terminalUrl()}/auth/invite?token=${token}`
  const who = user.name || user.email
  const footer = 'The invitation is valid for 7 days. If you did not expect it, ignore this email.'
  try {
    await sendMail(
      email,
      `${who} invited you to ${account.name} on Loudpilot`,
      `${who} invited you to work on ${account.name} in Loudpilot.\n\nJoin: ${link}\n\n${footer}`,
      actionEmail(`${escapeHtml(who)} invited you to work on <b>${escapeHtml(account.name)}</b> in Loudpilot.`, 'Join the team', link, footer),
    )
  } catch (e) {
    console.error('invite mail failed', e)
    return { error: "The invitation is saved but the email didn't go out. Try again in a minute." }
  }
  revalidatePath('/app/team')
  return { ok: `Invitation sent to ${email}` }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export async function revokeInvite(id: string) {
  const { account } = await manager()
  await prisma.invitation.deleteMany({ where: { id, accountId: account.id, acceptedAt: null } })
  revalidatePath('/app/team')
}

export async function setRole(memberId: string, role: MemberRole) {
  const { account } = await manager()
  if (role !== 'ADMIN' && role !== 'EDITOR') return
  const m = await prisma.accountMember.findFirst({ where: { id: memberId, accountId: account.id } })
  // The owner stays owner; nobody becomes owner here.
  if (!m || m.role === 'OWNER') return
  await prisma.accountMember.update({ where: { id: m.id }, data: { role } })
  revalidatePath('/app/team')
}

// Removes a teammate (owners and admins), or yourself (anyone but the owner).
export async function removeMember(memberId: string) {
  const { user, account, role: mine, asAdmin } = await requireContext()
  const m = await prisma.accountMember.findFirst({ where: { id: memberId, accountId: account.id } })
  if (!m || m.role === 'OWNER') return
  const self = m.userId === user.id
  if (!self && mine === 'EDITOR' && !asAdmin) return
  await prisma.$transaction([
    prisma.accountMember.delete({ where: { id: m.id } }),
    // Their API tokens for this account's companies stop working too.
    prisma.accessToken.updateMany({
      where: { userId: m.userId, workspace: { accountId: account.id }, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])
  revalidatePath('/app/team')
}
