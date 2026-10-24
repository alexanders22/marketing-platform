'use server'

import { randomBytes } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ensureApiPartner } from '@/lib/api-access'
import { webhookSecret } from '@/lib/alerts'
import { requireContext } from '@/lib/context'
import { encrypt, generateApiKey } from '@/lib/crypto'
import { apiAllowed } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { isPrivateAddress } from '@/lib/safe-fetch'

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

// The webhook must be a public server: not our own network (the same rule
// the sender enforces with safePostJson, checked here to say so up front).
async function publicHost(value: string) {
  const url = new URL(value)
  if (url.username || url.password) return false
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return !isPrivateAddress(host)
  try {
    const addresses = await lookup(host, { all: true })
    return addresses.length > 0 && !addresses.some((a) => isPrivateAddress(a.address))
  } catch {
    return false
  }
}

// Where Loudpilot posts signed events (alerts…). An empty value turns it off.
export async function saveWebhook(url: string): Promise<{ ok?: string; error?: string }> {
  const o = await owner()
  if ('error' in o) return { error: o.error }
  const partner = await ensureApiPartner(o.ctx.account)
  const value = url.trim()
  if (value && !Url.safeParse(value).success) return { error: 'Use an https:// address' }
  if (value && !(await publicHost(value))) return { error: 'Use the public address of your server' }
  // The secret is stored encrypted; one saved in plain text before is kept and encrypted now.
  const secret = partner.webhookSecret ? webhookSecret(partner.webhookSecret) : `whsec_${randomBytes(24).toString('base64url')}`
  await prisma.partner.update({
    where: { id: partner.id },
    data: { webhookUrl: value || null, webhookSecret: encrypt(secret) },
  })
  revalidatePath('/app/api')
  return { ok: value ? 'Webhook saved' : 'Webhook turned off' }
}
