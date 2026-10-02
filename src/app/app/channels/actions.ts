'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'

// Disconnect: the token goes at once; deliveries and insights cascade.
export async function disconnectAccount(id: string): Promise<{ error?: string }> {
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only owners and admins can change channels' }
  const { count } = await prisma.socialAccount.deleteMany({ where: { id, workspaceId: workspace.id } })
  if (count === 0) return { error: 'Account not found' }
  revalidatePath('/app', 'layout')
  return {}
}
