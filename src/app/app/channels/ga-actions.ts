'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { requireContext } from '@/lib/context'
import { syncWebsite, type GaProperty } from '@/lib/ga'
import { prisma } from '@/lib/prisma'

// The property to read, from the ones Google listed when connecting.
export async function pickGaProperty(pendingId: string, propertyId: string): Promise<{ error?: string }> {
  const { workspace, role, asAdmin } = await requireContext()
  if (role === 'EDITOR' && !asAdmin) return { error: 'Only owners and admins connect channels.' }
  const pending = await prisma.socialAccount.findFirst({
    where: { id: pendingId, workspaceId: workspace.id, network: 'GOOGLE_ANALYTICS', externalId: { startsWith: 'pending:' } },
  })
  if (!pending) return { error: 'This connection expired — connect Google Analytics again.' }
  const p = ((pending.meta as { properties?: GaProperty[] } | null)?.properties ?? []).find((x) => x.id === propertyId)
  if (!p) return { error: 'Pick one of the listed properties' }

  const same = await prisma.socialAccount.findFirst({ where: { workspaceId: workspace.id, network: 'GOOGLE_ANALYTICS', externalId: p.id } })
  const tokens = { accessTokenEnc: pending.accessTokenEnc, refreshTokenEnc: pending.refreshTokenEnc, expiresAt: pending.expiresAt, scopes: pending.scopes }
  const id = same
    ? (await prisma.$transaction([
        prisma.socialAccount.update({ where: { id: same.id }, data: { ...tokens, name: p.name, handle: p.account || null, status: 'ACTIVE', lastError: null } }),
        prisma.socialAccount.delete({ where: { id: pending.id } }),
      ]))[0].id
    : (await prisma.socialAccount.update({ where: { id: pending.id }, data: { externalId: p.id, name: p.name, handle: p.account || null, meta: {} } })).id
  after(() => syncWebsite(id).catch((e) => console.error('GA first sync failed', e instanceof Error ? e.message : e)))
  revalidatePath('/app/channels')
  return {}
}

export async function syncGaNow(accountId: string): Promise<{ error?: string; days?: number }> {
  const { workspace } = await requireContext()
  const a = await prisma.socialAccount.findFirst({ where: { id: accountId, workspaceId: workspace.id, network: 'GOOGLE_ANALYTICS' } })
  if (!a) return { error: 'Not found' }
  try {
    const days = await syncWebsite(a.id)
    revalidatePath('/app', 'layout')
    return { days }
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 200) : 'Google Analytics did not answer' }
  }
}
