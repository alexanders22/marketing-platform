'use server'

import { revalidatePath } from 'next/cache'
import { aiEnabled } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { refreshDossier } from '@/lib/dossier'
import { prisma } from '@/lib/prisma'

// Re-read the website and every connected account, then audit again.
export async function refreshDossierNow(): Promise<{ error?: string }> {
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only owners and admins can refresh the dossier' }
  if (!aiEnabled()) return { error: 'AI is not configured' }
  const last = await prisma.brandAudit.findFirst({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
  if (last && Date.now() - last.createdAt.getTime() < 10 * 60 * 1000) return { error: 'The dossier was refreshed a few minutes ago — try again later.' }
  const res = await refreshDossier(workspace.id, { profile: true, audit: true })
  if ('skipped' in res) return { error: 'Already refreshing — give it a minute.' }
  revalidatePath('/app/dossier')
  return {}
}
