'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { addressDraft, BillingAddress, savedAddress } from '@/lib/billing-address'
import { requireContext } from '@/lib/context'
import { monremEnabled } from '@/lib/monrem'
import { cancelAutoRenew, startCheckout, type Purchase } from '@/lib/payments'
import { prisma } from '@/lib/prisma'

const Input = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('PACK'), credits: z.number().int().positive() }),
  z.object({ kind: z.literal('PLAN'), plan: z.enum(['STARTER', 'TEAM', 'AGENCY']), cycle: z.enum(['MONTHLY', 'YEARLY']), autoRenew: z.boolean().optional() }),
])

// Opens Monrem's payment page for a credit pack or a plan period. Monrem needs
// the payer's billing address: without a saved one the form is asked for
// (needAddress), and an address sent along is saved for next time.
export async function checkout(
  raw: z.input<typeof Input>,
  address?: z.input<typeof BillingAddress>,
): Promise<{ url?: string; error?: string; needAddress?: BillingAddress }> {
  const { account, user, role } = await requireContext()
  if (role !== 'OWNER' && role !== 'ADMIN') return { error: 'Only the account owner or an admin can pay' }
  if (!monremEnabled()) return { error: 'Card payments are not available yet' }
  const parsed = Input.safeParse(raw)
  if (!parsed.success) return { error: 'Unknown purchase' }
  let billing = savedAddress(account.billingAddress)
  if (address) {
    const a = BillingAddress.safeParse(address)
    if (!a.success) return { error: a.error.issues[0].message, needAddress: addressDraft(billing, account.country) }
    billing = a.data
    await prisma.account.update({ where: { id: account.id }, data: { billingAddress: billing } })
  }
  if (!billing) return { needAddress: addressDraft(null, account.country) }
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || '127.0.0.1'
  return startCheckout({ accountId: account.id, user, billing, ip, purchase: parsed.data as Purchase })
}

export async function saveBillingAddress(address: z.input<typeof BillingAddress>): Promise<{ error?: string }> {
  const { account, role } = await requireContext()
  if (role !== 'OWNER' && role !== 'ADMIN') return { error: 'Only the account owner or an admin can change billing' }
  const a = BillingAddress.safeParse(address)
  if (!a.success) return { error: a.error.issues[0].message }
  await prisma.account.update({ where: { id: account.id }, data: { billingAddress: a.data } })
  revalidatePath('/app/credits')
  return {}
}

// Turns auto-renewal off; the paid period runs to its end.
export async function cancelRenewal(): Promise<{ error?: string }> {
  const { account, role } = await requireContext()
  if (role !== 'OWNER' && role !== 'ADMIN') return { error: 'Only the account owner or an admin can change billing' }
  const res = await cancelAutoRenew(account.id)
  revalidatePath('/app/credits')
  return res
}
