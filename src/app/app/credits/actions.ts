'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { addressDraft, BillingAddress, savedAddress, type AddressForm } from '@/lib/billing-address'
import { requireContext } from '@/lib/context'
import { monremEnabled } from '@/lib/monrem'
import { cancelAutoRenew, startCheckout, type Purchase } from '@/lib/payments'
import { prisma } from '@/lib/prisma'

const Input = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('PACK'), credits: z.number().int().positive(), test: z.boolean().optional() }),
  z.object({ kind: z.literal('PLAN'), plan: z.enum(['STARTER', 'TEAM', 'AGENCY']), cycle: z.enum(['MONTHLY', 'YEARLY']), autoRenew: z.boolean().optional(), test: z.boolean().optional() }),
])

// Opens Monrem's payment page for a credit pack or a plan period. Monrem needs
// the payer's billing address: without a saved one the form is asked for
// (needAddress), and an address sent along is saved for next time.
export async function checkout(
  raw: z.input<typeof Input>,
  address?: AddressForm,
): Promise<{ url?: string; embed?: boolean; error?: string; needAddress?: Required<AddressForm> }> {
  const { account, user, role, asAdmin } = await requireContext()
  if (role !== 'OWNER' && role !== 'ADMIN') return { error: 'Only the account owner or an admin can pay' }
  if (!monremEnabled()) return { error: 'Card payments are not available yet' }
  const parsed = Input.safeParse(raw)
  if (!parsed.success) return { error: 'Unknown purchase' }
  // ₾1 test payments: super admins, in an account of their own (not one they're viewing).
  if (parsed.data.test && (user.role !== 'SUPER_ADMIN' || asAdmin)) return { error: 'Unknown purchase' }
  let billing = savedAddress(account.billingAddress)
  if (address) {
    const a = BillingAddress.safeParse(address)
    if (!a.success) return { error: a.error.issues[0].message, needAddress: addressDraft(address, account.country, user) }
    billing = a.data
    await prisma.account.update({ where: { id: account.id }, data: { billingAddress: billing } })
  }
  if (!billing) return { needAddress: addressDraft(account.billingAddress, account.country, user) }
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || '127.0.0.1'
  return startCheckout({ accountId: account.id, user, billing, ip, purchase: parsed.data as Purchase })
}

export async function saveBillingAddress(address: AddressForm): Promise<{ error?: string }> {
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
