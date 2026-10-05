'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { aiEnabled } from '@/lib/ai'
import { BrandInput, type BrandDraft } from '@/lib/brand-schema'
import { listCompanies, requireContext, WORKSPACE_COOKIE } from '@/lib/context'
import { refreshProfile } from '@/lib/dossier'
import { companyLimit } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'

const YEAR = 365 * 86_400_000

async function remember(workspaceId: string) {
  ;(await cookies()).set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(Date.now() + YEAR),
  })
}

// Switch the company the app works in. Only companies the user belongs to.
export async function switchCompany(workspaceId: string) {
  const user = await requireUser()
  const company = (await listCompanies(user.id)).find((c) => c.id === workspaceId)
  if (!company) return
  await remember(workspaceId)
  redirect(company.paused ? '/paused' : '/app')
}

// A new company (brand) in the current account: own channels, brand kit and
// dossier; credits and plan stay shared with the account.
export async function addCompany(draft: BrandDraft): Promise<{ error?: string }> {
  const { account, role, asAdmin } = await requireContext()
  if (role === 'EDITOR' && !asAdmin) return { error: 'Only owners and admins can add companies.' }
  const parsed = BrandInput.safeParse(draft)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const b = parsed.data
  // The plan's limit applies to everyone's own account; only a super admin
  // working in someone else's account (support) is not stopped by it.
  const limit = asAdmin ? Infinity : companyLimit(account.plan)

  const created = await prisma.$transaction(async (tx) => {
    // Per-account lock: two quick submits can't both slip under the limit.
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${'companies:' + account.id}))`
    const count = await tx.workspace.count({ where: { accountId: account.id } })
    if (count >= limit) return null
    const ws = await tx.workspace.create({ data: { name: b.name, accountId: account.id, locale: 'en' } })
    // With the API on, the new company is reachable through it by its id.
    const api = await tx.partner.findUnique({ where: { ownerAccountId: account.id }, select: { id: true } })
    if (api) await tx.workspace.update({ where: { id: ws.id }, data: { partnerId: api.id, externalId: ws.id } })
    await tx.brandKit.create({
      data: { workspaceId: ws.id, website: b.website, description: b.description, logoUrl: b.logoUrl, colors: b.colors, socialLinks: b.socialLinks },
    })
    return ws.id
  })
  if (!created) {
    return {
      error:
        account.plan === 'NONE'
          ? 'Choose a plan to add more companies.'
          : `Your plan includes ${limit} compan${limit === 1 ? 'y' : 'ies'}. Upgrade to add more.`,
    }
  }
  await remember(created)
  if (b.website && aiEnabled()) {
    after(() => refreshProfile(created).catch((e) => console.warn('profile for new company failed', e instanceof Error ? e.message : e)))
  }
  redirect('/app/dashboard')
}
