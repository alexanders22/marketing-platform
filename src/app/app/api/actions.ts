'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ensureApiPartner } from '@/lib/api-access'
import { requireContext } from '@/lib/context'
import { generateApiKey } from '@/lib/crypto'
import { apiAllowed } from '@/lib/plans'
import { prisma } from '@/lib/prisma'

// Owners and admins manage API access, and only while the plan includes it.
async function owner() {
  const ctx = await requireContext()
  if (ctx.role === 'EDITOR' && !ctx.asAdmin) return { error: 'Only owners and admins manage API keys.' } as const
  if (!apiAllowed(ctx.account) && !ctx.asAdmin) return { error: 'The API is part of the Agency plan.' } as const
  return { ctx } as const
}

export async function createApiKey(name: string): Promise<{ key?: string; error?: string }> {
  const o = await owner()
  if ('error' in o) return { error: o.error }
  const label = name.trim().slice(0, 80) || 'API key'
  const partner = await ensureApiPartner(o.ctx.account)
  if ((await prisma.apiKey.count({ where: { partnerId: partner.id, revokedAt: null } })) >= 10) return { error: 'Up to 10 active keys. Revoke one first.' }
  const { key, prefix, keyHash } = generateApiKey()
  await prisma.apiKey.create({ data: { partnerId: partner.id, name: label, prefix, keyHash } })
  revalidatePath('/app/api')
  return { key }
}

export async function revokeApiKey(id: string) {
  const o = await owner()
  if ('error' in o) return
  await prisma.apiKey.updateMany({ where: { id, partner: { ownerAccountId: o.ctx.account.id }, revokedAt: null }, data: { revokedAt: new Date() } })
  revalidatePath('/app/api')
}

const Url = z.url({ protocol: /^https$/, error: 'Use an https:// address' }).max(500)

// Where Loudpilot posts signed events (alerts…). An empty value turns it off.
export async function saveWebhook(url: string): Promise<{ ok?: string; error?: string }> {
  const o = await owner()
  if ('error' in o) return { error: o.error }
  const partner = await ensureApiPartner(o.ctx.account)
  const value = url.trim()
  if (value && !Url.safeParse(value).success) return { error: 'Use an https:// address' }
  await prisma.partner.update({
    where: { id: partner.id },
    data: { webhookUrl: value || null, webhookSecret: partner.webhookSecret ?? `whsec_${randomBytes(24).toString('base64url')}` },
  })
  revalidatePath('/app/api')
  return { ok: value ? 'Webhook saved' : 'Webhook turned off' }
}
