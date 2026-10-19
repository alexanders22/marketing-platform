'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { requireContext } from '@/lib/context'
import { monremEnabled } from '@/lib/monrem'
import { startCheckout, type Purchase } from '@/lib/payments'

const Input = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('PACK'), credits: z.number().int().positive() }),
  z.object({ kind: z.literal('PLAN'), plan: z.enum(['STARTER', 'TEAM', 'AGENCY']), cycle: z.enum(['MONTHLY', 'YEARLY']) }),
])

// Opens Monrem's payment page for a credit pack or a plan period.
export async function checkout(raw: z.input<typeof Input>): Promise<{ url?: string; error?: string }> {
  const { account, user, role } = await requireContext()
  if (role !== 'OWNER' && role !== 'ADMIN') return { error: 'Only the account owner or an admin can pay' }
  if (!monremEnabled()) return { error: 'Card payments are not available yet' }
  const parsed = Input.safeParse(raw)
  if (!parsed.success) return { error: 'Unknown purchase' }
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || '127.0.0.1'
  return startCheckout({ accountId: account.id, user, country: account.country, ip, purchase: parsed.data as Purchase })
}
