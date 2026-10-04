import 'server-only'
import { notFound } from 'next/navigation'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getSessionUser } from './session'

// Super admin only. Everyone else gets a plain 404: the panel's existence
// isn't advertised.
export async function requireSuperAdmin() {
  const user = await getSessionUser()
  if (!user || user.role !== 'SUPER_ADMIN') notFound()
  return user
}

export async function logAdmin(
  admin: { id: string; email: string },
  action: string,
  targetType: 'account' | 'workspace' | 'user' | 'member',
  targetId: string,
  details?: Prisma.InputJsonValue,
) {
  await prisma.adminLog.create({ data: { adminId: admin.id, adminEmail: admin.email, action, targetType, targetId, details } })
}
