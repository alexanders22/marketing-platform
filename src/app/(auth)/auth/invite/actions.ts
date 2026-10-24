'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revokeUserTokens } from '@/lib/access-tokens'
import { WORKSPACE_COOKIE } from '@/lib/context'
import { sha256 } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/session'

// The emailed invitation proves the address: claim it once, sign that
// address in (creating the user if new) and add them to the account.
export async function acceptInvite(form: FormData) {
  const token = String(form.get('token') ?? '')
  if (!token) redirect('/login?error=invite')
  const invite = await prisma.invitation.findUnique({ where: { tokenHash: sha256(token) } })
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) redirect('/login?error=invite')

  const joined = await prisma.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date() } })
    if (claimed.count !== 1) return null
    const existing = await tx.user.findUnique({ where: { email: invite.email } })
    if (existing && !existing.emailVerifiedAt) {
      // First proof of the address: drop a password nobody verified, and the
      // sessions and tokens it may have opened.
      await tx.session.deleteMany({ where: { userId: existing.id } })
      await revokeUserTokens(existing.id, tx)
    }
    const user = existing
      ? existing.emailVerifiedAt
        ? existing
        : await tx.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date(), passwordHash: null } })
      : await tx.user.create({ data: { email: invite.email, name: invite.email.split('@')[0], emailVerifiedAt: new Date() } })
    await tx.accountMember.upsert({
      where: { accountId_userId: { accountId: invite.accountId, userId: user.id } },
      create: { accountId: invite.accountId, userId: user.id, role: invite.role },
      update: {},
    })
    const first = await tx.workspace.findFirst({ where: { accountId: invite.accountId }, orderBy: { createdAt: 'asc' }, select: { id: true } })
    return { userId: user.id, workspaceId: first?.id }
  })
  if (!joined) redirect('/login?error=invite')
  await createSession(joined.userId)
  if (joined.workspaceId) {
    ;(await cookies()).set(WORKSPACE_COOKIE, joined.workspaceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 86_400,
    })
  }
  redirect('/app')
}
