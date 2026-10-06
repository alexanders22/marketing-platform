'use server'

import { revalidatePath } from 'next/cache'
import { createBoost, setBoostStatus } from '@/lib/boost'
import { BoostInput } from '@/lib/boost-options'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'

// Boosting spends the company's ad money: owners and admins only.
const canSpend = (role: string) => role === 'OWNER' || role === 'ADMIN'

export async function boostPost(input: unknown) {
  const { workspace, user, role } = await requireContext()
  if (!canSpend(role)) return { error: 'Only the owner or an admin can spend the ad budget.' }
  const parsed = BoostInput.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the settings.' }
  const res = await createBoost(workspace.id, user.id, parsed.data)
  const d = await prisma.postDelivery.findUnique({ where: { id: parsed.data.deliveryId }, select: { postId: true } })
  if (d) revalidatePath(`/app/posts/${d.postId}`)
  return res
}

export async function changeBoost(id: string, status: 'ACTIVE' | 'PAUSED') {
  const { workspace, role } = await requireContext()
  if (!canSpend(role)) return { error: 'Only the owner or an admin can change a boost.' }
  if (status !== 'ACTIVE' && status !== 'PAUSED') return { error: 'Unknown status.' }
  const res = await setBoostStatus(workspace.id, id, status)
  const b = await prisma.boost.findFirst({ where: { id, workspaceId: workspace.id }, select: { delivery: { select: { postId: true } } } })
  if (b) revalidatePath(`/app/posts/${b.delivery.postId}`)
  return res
}
