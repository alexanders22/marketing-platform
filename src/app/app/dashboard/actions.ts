'use server'

import { revalidatePath } from 'next/cache'
import { aiEnabled, summarizePerformance, type PerformanceSummary } from '@/lib/ai'
import { PERIODS, dashboard, summaryFacts, type Period } from '@/lib/analytics'
import { requireContext } from '@/lib/context'
import { COST, balanceOf, charge, notEnough } from '@/lib/credits'
import { syncAdAccount } from '@/lib/meta-ads'
import { prisma } from '@/lib/prisma'

export async function generateSummary(period: number): Promise<{ summary?: PerformanceSummary; error?: string }> {
  const { workspace, account, brand } = await requireContext()
  if (!PERIODS.includes(period as Period)) return { error: 'Unknown period' }
  if (!aiEnabled()) return { error: 'AI is not configured' }
  const have = await balanceOf(account.id)
  if (have < COST.summary) return { error: notEnough(COST.summary, have) }

  const data = await dashboard(workspace.id, period as Period)
  if (data.current.spend === 0 && data.current.posts === 0 && data.previous.spend === 0 && data.previous.posts === 0) {
    return { error: 'No results to summarise yet — connect an ad account or publish a few posts first.' }
  }
  let summary: PerformanceSummary
  try {
    summary = await summarizePerformance(workspace.name, brand, summaryFacts(data))
  } catch (e) {
    console.error('summary failed', e)
    return { error: 'The summary could not be written — try again.' }
  }
  if (!summary.headline) return { error: 'The summary could not be written — try again.' }
  // Charged only once the summary exists.
  const ok = await charge(account.id, workspace.id, [{ amount: COST.summary, reason: 'AI_TEXT', note: `Performance summary (${period} days)` }])
  if (!ok) return { error: notEnough(COST.summary, await balanceOf(account.id)) }
  await prisma.aiSummary.create({ data: { workspaceId: workspace.id, periodDays: period, text: JSON.stringify(summary) } })
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
