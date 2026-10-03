'use server'

import { revalidatePath } from 'next/cache'
import { createPersonalToken } from '@/lib/access-tokens'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'

export async function createToken(name: string): Promise<{ token?: string; error?: string }> {
  const { user, workspace } = await requireContext()
  const active = await prisma.accessToken.count({ where: { userId: user.id, workspaceId: workspace.id, kind: 'PERSONAL', revokedAt: null } })
  if (active >= 10) return { error: 'Up to 10 personal tokens — revoke one first.' }
  const { token } = await createPersonalToken(user.id, workspace.id, name.trim() || 'Personal token')
  revalidatePath('/app/mcp')
  return { token }
}

// Your own tokens; owners and admins can also disconnect anyone's apps.
export async function revokeToken(id: string): Promise<{ error?: string }> {
  const { user, workspace, role } = await requireContext()
  const { count } = await prisma.accessToken.updateMany({
    where: { id, workspaceId: workspace.id, revokedAt: null, ...(role === 'EDITOR' ? { userId: user.id } : {}) },
    data: { revokedAt: new Date(), refreshHash: null },
  })
  if (count === 0) return { error: 'Not found' }
  revalidatePath('/app/mcp')
  return {}
}
