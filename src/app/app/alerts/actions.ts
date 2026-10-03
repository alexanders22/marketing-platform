'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'

export async function markAlertsRead(ids?: string[]) {
  const { workspace } = await requireContext()
  await prisma.alert.updateMany({
    where: { workspaceId: workspace.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  })
  revalidatePath('/app', 'layout')
}

export async function setAlertEmails(on: boolean) {
  const { account, role } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only owners and admins can change this' }
  await prisma.account.update({ where: { id: account.id }, data: { alertEmails: on } })
  revalidatePath('/app/alerts')
  return {}
}
