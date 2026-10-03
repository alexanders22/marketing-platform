'use server'

import { redirect } from 'next/navigation'
import { checkAuthorize, createCode, withQuery, type AuthorizeParams } from '@/lib/oauth'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'

export async function decide(p: AuthorizeParams, workspaceId: string, allow: boolean) {
  const user = await requireUser()
  const check = await checkAuthorize(p)
  if (check.error) throw new Error(check.error)
  if (!allow) redirect(withQuery(p.redirect_uri, { error: 'access_denied', state: p.state }))
  // Only a workspace of an account the user belongs to.
  const ws = await prisma.workspace.findFirst({ where: { id: workspaceId, account: { members: { some: { userId: user.id } } } }, select: { id: true } })
  if (!ws) throw new Error('Workspace not found')
  const code = await createCode(p, user.id, ws.id)
  redirect(withQuery(p.redirect_uri, { code, state: p.state }))
}
