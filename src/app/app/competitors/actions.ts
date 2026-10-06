'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { aiEnabled, buildCompanyProfile, compareCompetitors, findCompetitors, LANGUAGES, type CompanyProfile, type FoundCompetitor } from '@/lib/ai'
import { aiError } from '@/lib/ai-health'
import { requireContext } from '@/lib/context'
import { balanceOf, charge, notEnough, prices } from '@/lib/credits'
import { crawlSite, withDossier } from '@/lib/dossier'
import { prisma } from '@/lib/prisma'

const MAX = 10

const site = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .refine((v) => !v || z.url().safeParse(v).success, 'Enter a valid website')
const Input = z.object({
  name: z.string().trim().min(1, 'Name the competitor').max(80),
  website: site.optional().default(''),
  facebook: z.string().trim().max(200).optional().default(''),
  instagram: z.string().trim().max(200).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
})

export async function addCompetitor(raw: z.input<typeof Input>): Promise<{ id?: string; error?: string }> {
  const { workspace } = await requireContext()
  const parsed = Input.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const c = parsed.data
  if ((await prisma.competitor.count({ where: { workspaceId: workspace.id } })) >= MAX) return { error: `Up to ${MAX} competitors` }
  const row = await prisma.competitor.create({
    data: { workspaceId: workspace.id, name: c.name, website: c.website || null, facebook: c.facebook || null, instagram: c.instagram || null, notes: c.notes },
  })
  revalidatePath('/app/competitors')
  return { id: row.id }
}

export async function updateCompetitor(id: string, raw: z.input<typeof Input>): Promise<{ error?: string }> {
  const { workspace } = await requireContext()
  const parsed = Input.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const c = parsed.data
  const old = await prisma.competitor.findFirst({ where: { id, workspaceId: workspace.id } })
  if (!old) return { error: 'Not found' }
  await prisma.competitor.update({
    where: { id },
    data: {
      name: c.name,
      website: c.website || null,
      facebook: c.facebook || null,
      instagram: c.instagram || null,
      notes: c.notes,
      // A new website needs a new read.
      ...(old.website !== (c.website || null) ? { profile: Prisma.DbNull, analyzedAt: null, error: null } : {}),
    },
  })
  revalidatePath('/app/competitors')
  return {}
}

export async function deleteCompetitor(id: string) {
  const { workspace } = await requireContext()
  await prisma.competitor.deleteMany({ where: { id, workspaceId: workspace.id } })
  revalidatePath('/app/competitors')
}

// Real competitors from Google Search, to confirm one by one.
export async function suggestCompetitors(): Promise<{ found?: FoundCompetitor[]; error?: string }> {
  const { workspace, account, brand } = await requireContext()
  const COST = await prices()
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  if (account.creditBalance < COST.competitorSearch) return { error: notEnough(COST.competitorSearch, account.creditBalance) }
  const [profile, existing] = await Promise.all([
    prisma.brandProfile.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.competitor.findMany({ where: { workspaceId: workspace.id }, select: { name: true, website: true } }),
  ])
  if (!profile && !brand?.website && !brand?.description) return { error: 'Add your website or a description in Brand first, so Loudpilot knows what to look for.' }
  let found: FoundCompetitor[]
  try {
    found = await findCompetitors(workspace.name, (profile?.data as CompanyProfile | undefined) ?? null, brand, existing.map((e) => e.name))
  } catch (e) {
    console.error('findCompetitors failed', e)
    return { error: aiError(e, 'Could not search for competitors. Try again.') }
  }
  const host = (u: string | null) => (u ? u.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0].toLowerCase() : '')
  const known = new Set(existing.map((e) => host(e.website)).filter(Boolean))
  found = found.filter((f) => !known.has(host(f.website)) && host(f.website) !== host(brand?.website ?? null))
  await charge(account.id, workspace.id, [{ amount: COST.competitorSearch, reason: 'AI_TEXT', note: 'Find competitors', action: 'competitorSearch', units: 1 }])
  revalidatePath('/app', 'layout')
  return { found }
}

// Reads the competitors' websites (the ones not read yet, or all with
// `force`), then writes the comparison. Charged per website read and per
// report, only for what succeeded.
export async function compareNow(input: { language: string; refresh?: boolean }): Promise<{ error?: string }> {
  const { workspace, account, brand } = await requireContext()
  const COST = await prices()
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  const language = LANGUAGES.find((l) => l === input.language) ?? 'English'
  const rivals = await prisma.competitor.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'asc' } })
  if (rivals.length === 0) return { error: 'Add at least one competitor' }
  const toRead = rivals.filter((r) => r.website && (input.refresh || !r.profile))
  const need = toRead.length * COST.competitor + COST.compare
  const have = await balanceOf(account.id)
  if (have < need) return { error: notEnough(need, have) }

  let read = 0
  await Promise.all(
    toRead.map(async (r) => {
      try {
        const pages = await crawlSite(r.website!, 5)
        const profile = await buildCompanyProfile(r.name, pages)
        await prisma.competitor.update({ where: { id: r.id }, data: { profile, analyzedAt: new Date(), error: null } })
        r.profile = profile as unknown as Prisma.JsonValue
        read++
      } catch (e) {
        await prisma.competitor.update({ where: { id: r.id }, data: { error: (e instanceof Error ? e.message : String(e)).slice(0, 200) } })
      }
    }),
  )
  if (read) await charge(account.id, workspace.id, [{ amount: read * COST.competitor, reason: 'AI_TEXT', note: `Competitor websites (${read})`, action: 'competitor', units: read }])

  const own = await prisma.brandProfile.findUnique({ where: { workspaceId: workspace.id } })
  let data
  try {
    data = await compareCompetitors(
      workspace.name,
      await withDossier(brand, workspace.id),
      (own?.data as CompanyProfile | undefined) ?? null,
      rivals.map((r) => ({ name: r.name, website: r.website, notes: r.notes, profile: (r.profile as CompanyProfile | null) ?? null })),
      language,
    )
  } catch (e) {
    console.error('compareCompetitors failed', e)
    revalidatePath('/app/competitors')
    return { error: aiError(e, 'The comparison could not be written. Try again.') }
  }
  if (!(await charge(account.id, workspace.id, [{ amount: COST.compare, reason: 'AI_TEXT', note: 'Competitor comparison', action: 'compare', units: 1 }]))) {
    return { error: notEnough(COST.compare, await balanceOf(account.id)) }
  }
  await prisma.competitorReport.create({ data: { workspaceId: workspace.id, language, data: data as unknown as Prisma.InputJsonValue } })
  revalidatePath('/app', 'layout')
  return {}
}
