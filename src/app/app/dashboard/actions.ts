'use server'

import { withDossier } from '@/lib/dossier'
import { revalidatePath } from 'next/cache'
import { aiEnabled, summarizePerformance, type PerformanceSummary } from '@/lib/ai'
import { PERIODS, dashboard, parseRange, summaryFacts, type Period } from '@/lib/analytics'
import { requireContext } from '@/lib/context'
import { balanceOf, charge, notEnough, prices } from '@/lib/credits'
import { syncAdAccount } from '@/lib/meta-ads'
import { prisma } from '@/lib/prisma'
import { aiError } from '@/lib/ai-health'

export async function generateSummary(period: number, range?: { from: string; to: string }): Promise<{ summary?: PerformanceSummary; error?: string }> {
  const { workspace, account, brand } = await requireContext()
  const COST = await prices()
  const chosen = range ? parseRange(range.from, range.to) : null
  if (range && !chosen) return { error: 'Pick a valid date range' }
  if (!chosen && !PERIODS.includes(period as Period)) return { error: 'Unknown period' }
  if (!aiEnabled()) return { error: 'AI is not configured' }
  const have = await balanceOf(account.id)
  if (have < COST.summary) return { error: notEnough(COST.summary, have) }

  const data = await dashboard(workspace.id, chosen ?? (period as Period))
  const site = (data.website?.current.sessions ?? 0) + (data.website?.previous.sessions ?? 0)
  if (data.current.spend === 0 && data.current.posts === 0 && data.previous.spend === 0 && data.previous.posts === 0 && site === 0) {
    return { error: 'No results to summarise yet — connect an ad account or Google Analytics, or publish a few posts first.' }
  }
  let summary: PerformanceSummary
  try {
    summary = await summarizePerformance(workspace.name, await withDossier(brand, workspace.id), summaryFacts(data))
  } catch (e) {
    console.error('summary failed', e)
    return { error: aiError(e, 'The summary could not be written — try again.') }
  }
  if (!summary.headline) return { error: 'The summary could not be written — try again.' }
  // Charged only once the summary exists.
  const ok = await charge(account.id, workspace.id, [{ amount: COST.summary, reason: 'AI_TEXT', note: chosen ? `Performance summary (${chosen.from} – ${chosen.to})` : `Performance summary (${period} days)`, action: 'summary', units: 1 }])
  if (!ok) return { error: notEnough(COST.summary, await balanceOf(account.id)) }
  // Saved only for the standard periods (the page shows the latest one).
  if (!chosen) await prisma.aiSummary.create({ data: { workspaceId: workspace.id, periodDays: period, text: JSON.stringify(summary) } })
  revalidatePath('/app', 'layout')
  return { summary }
}

// "Sync now": re-read every ad account of the workspace.
export async function syncAds(): Promise<{ error?: string }> {
  const { workspace } = await requireContext()
  const accounts = await prisma.socialAccount.findMany({ where: { workspaceId: workspace.id, network: 'META_ADS', status: 'ACTIVE' } })
  if (accounts.length === 0) return { error: 'No ad account connected' }
  const failed: string[] = []
  for (const a of accounts) await syncAdAccount(a.id).catch(() => failed.push(a.name))
  revalidatePath('/app/dashboard')
  return failed.length ? { error: `Could not read ${failed.join(', ')} — see Channels.` } : {}
}
