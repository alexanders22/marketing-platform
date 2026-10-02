'use server'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { importBrandFromWebsite, type ImportedBrand } from '@/lib/brand-import'
import { BrandInput, type BrandDraft } from '@/lib/brand-schema'

export async function analyzeWebsite(url: string): Promise<{ brand?: ImportedBrand; error?: string }> {
  await requireUser()
  if (!url.trim()) return { error: 'Enter your website address' }
  try {
    return { brand: await importBrandFromWebsite(url) }
  } catch (e) {
    console.warn('brand import failed', url, e)
    return { error: "We couldn't read that website. Check the address or set up your brand manually." }
  }
}

// Creates the paying account, its first workspace and the brand kit in one go.
export async function completeOnboarding(draft: BrandDraft): Promise<{ error?: string }> {
  const user = await requireUser()
  const parsed = BrandInput.safeParse(draft)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const b = parsed.data

  // Per-user advisory lock: a double submit or retry can't create two accounts.
  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${'onboarding:' + user.id}))`
    if (await tx.accountMember.findFirst({ where: { userId: user.id }, select: { id: true } })) return false
    const account = await tx.account.create({
      data: { name: b.name, email: user.email, termsAcceptedAt: new Date() },
    })
    await tx.accountMember.create({ data: { accountId: account.id, userId: user.id, role: 'OWNER' } })
    const ws = await tx.workspace.create({ data: { name: b.name, accountId: account.id, locale: 'en' } })
    await tx.brandKit.create({
      data: {
        workspaceId: ws.id,
        website: b.website,
        description: b.description,
        logoUrl: b.logoUrl,
        colors: b.colors,
        socialLinks: b.socialLinks,
      },
    })
    return true
  })
  if (!created) redirect('/app')
  return {}
}
