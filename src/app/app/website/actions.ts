'use server'

import { revalidatePath } from 'next/cache'
import { aiEnabled, LANGUAGES, seoAdvice } from '@/lib/ai'
import { aiError } from '@/lib/ai-health'
import { requireContext } from '@/lib/context'
import { balanceOf, charge, notEnough, prices } from '@/lib/credits'
import { withDossier } from '@/lib/dossier'
import { prisma } from '@/lib/prisma'
import type { ScSite } from '@/lib/search-console'
import { runSeoAudit, type SeoReport } from '@/lib/seo'
import { runTrackingCheck } from '@/lib/tracking'
import { brandSite, geoReadiness, geoVisibility, saveGeo, type GeoReport } from '@/lib/geo'

export async function checkTracking(): Promise<{ error?: string }> {
  const { workspace } = await requireContext()
  await runTrackingCheck(workspace.id)
  revalidatePath('/app/website/tracking')
  return {}
}

export async function checkSeo(): Promise<{ error?: string }> {
  const { workspace } = await requireContext()
  await runSeoAudit(workspace.id)
  revalidatePath('/app/website')
  return {}
}

// The AI action plan for the latest SEO check, stored with it.
export async function planSeo(language: string): Promise<{ error?: string }> {
  const { workspace, account, brand } = await requireContext()
  const COST = await prices()
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  const have = await balanceOf(account.id)
  if (have < COST.seoAdvice) return { error: notEnough(COST.seoAdvice, have) }
  const last = await prisma.websiteAudit.findFirst({ where: { workspaceId: workspace.id, kind: 'SEO' }, orderBy: { createdAt: 'desc' } })
  if (!last) return { error: 'Run the check first.' }
  const r = last.result as unknown as SeoReport
  const lang = LANGUAGES.find((l) => l === language) ?? 'English'
  let advice
  try {
    // Only what the advice needs, to keep the prompt small.
    advice = await seoAdvice(workspace.name, await withDossier(brand, workspace.id), { url: r.url, score: r.score, checks: r.checks, pages: r.pages, search: r.search }, lang)
  } catch (e) {
    console.error('seoAdvice failed', e)
    return { error: aiError(e, 'The SEO plan could not be written. Try again.') }
  }
  await charge(account.id, workspace.id, [{ amount: COST.seoAdvice, reason: 'AI_TEXT', note: 'SEO action plan', action: 'seoAdvice', units: 1 }])
  await prisma.websiteAudit.update({ where: { id: last.id }, data: { result: { ...r, advice: { ...advice, language: lang, createdAt: new Date().toISOString() } } } })
  revalidatePath('/app', 'layout')
  return {}
}

export async function pickSearchSite(site: string): Promise<{ error?: string }> {
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only the owner or an admin can change this.' }
  const a = await prisma.socialAccount.findFirst({ where: { workspaceId: workspace.id, network: 'SEARCH_CONSOLE' } })
  const sites = ((a?.meta ?? {}) as { sites?: ScSite[] }).sites ?? []
  if (!a || !sites.some((s) => s.url === site)) return { error: 'Site not found.' }
  await prisma.socialAccount.update({ where: { id: a.id }, data: { externalId: site, name: site.replace(/^sc-domain:/, ''), lastError: null } })
  revalidatePath('/app/website')
  return {}
}

export async function disconnectSearchConsole(): Promise<{ error?: string }> {
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only the owner or an admin can change this.' }
  await prisma.socialAccount.deleteMany({ where: { workspaceId: workspace.id, network: 'SEARCH_CONSOLE' } })
  revalidatePath('/app/website')
  return {}
}

const lastGeo = async (workspaceId: string) =>
  (await prisma.websiteAudit.findFirst({ where: { workspaceId, kind: 'GEO' }, orderBy: { createdAt: 'desc' } }))?.result as GeoReport | undefined

// Free: is the site ready for AI crawlers? Keeps the last visibility result.
export async function checkGeoReadiness(): Promise<{ error?: string }> {
  const { workspace } = await requireContext()
  const url = await brandSite(workspace.id)
  const before = await lastGeo(workspace.id)
  await saveGeo(workspace.id, url, { readiness: await geoReadiness(url), ...(before?.visibility ? { visibility: before.visibility } : {}) })
  revalidatePath('/app/website/ai')
  return {}
}

// Paid: ask AI search the customers' questions and see who it recommends.
export async function checkGeoVisibility(language: string): Promise<{ error?: string }> {
  const { workspace, account, brand } = await requireContext()
  const COST = await prices()
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  const have = await balanceOf(account.id)
  if (have < COST.aiSearch) return { error: notEnough(COST.aiSearch, have) }
  const url = await brandSite(workspace.id)
  const lang = LANGUAGES.find((l) => l === language) ?? 'English'
  let visibility
  try {
    visibility = await geoVisibility(workspace.id, workspace.name, await withDossier(brand, workspace.id), url, lang)
  } catch (e) {
    console.error('geoVisibility failed', e)
    return { error: aiError(e, 'The AI search check could not run. Try again.') }
  }
  await charge(account.id, workspace.id, [{ amount: COST.aiSearch, reason: 'AI_TEXT', note: 'AI search visibility check', action: 'aiSearch', units: 1 }])
  await saveGeo(workspace.id, url, { readiness: await geoReadiness(url), visibility })
  revalidatePath('/app', 'layout')
  return {}
}
