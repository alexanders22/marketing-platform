'use server'

import { revalidatePath } from 'next/cache'
import { aiEnabled, suggestReply } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { charge, notEnough, prices } from '@/lib/credits'
import { withDossier } from '@/lib/dossier'
import { InboxError, markRead, sendReply, syncInbox } from '@/lib/inbox'
import { prisma } from '@/lib/prisma'
import { aiError } from '@/lib/ai-health'

export async function openConversation(id: string) {
  const { workspace } = await requireContext()
  await markRead(workspace.id, id)
  revalidatePath('/app', 'layout')
}

export async function reply(conversationId: string, text: string): Promise<{ error?: string }> {
  const { workspace, user } = await requireContext()
  try {
    await sendReply(workspace.id, conversationId, text, user.id)
  } catch (e) {
    if (e instanceof InboxError) return { error: e.message }
    console.error('reply failed', e)
    return { error: 'Could not send the message. Try again.' }
  }
  revalidatePath('/app/inbox')
  return {}
}

// Read new messages now instead of waiting for the next 2-minute sync.
export async function refreshInbox() {
  const { workspace } = await requireContext()
  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId: workspace.id, network: { in: ['FACEBOOK', 'INSTAGRAM'] }, status: 'ACTIVE' },
    select: { id: true },
  })
  for (const a of accounts) await syncInbox(a.id).catch((e) => console.error('inbox refresh failed', a.id, e))
  revalidatePath('/app', 'layout')
}

export async function draftReply(conversationId: string): Promise<{ text?: string; error?: string }> {
  const { account, workspace, brand } = await requireContext()
  const COST = await prices()
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  if (account.creditBalance < COST.reply) return { error: notEnough(COST.reply, account.creditBalance) }
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId: workspace.id },
    include: { messages: { orderBy: { sentAt: 'desc' }, take: 20 } },
  })
  if (!conv) return { error: 'Conversation not found' }
  let text: string
  try {
    text = await suggestReply(
      workspace.name,
      await withDossier(brand, workspace.id),
      conv.messages.reverse().map((m) => ({ fromMe: m.fromMe, text: m.text, at: m.sentAt.toISOString().slice(0, 16) })),
    )
  } catch (e) {
    console.error('suggestReply failed', e)
    return { error: aiError(e, 'The AI could not draft a reply. Try again.') }
  }
  const ok = await charge(account.id, workspace.id, [{ amount: COST.reply, reason: 'AI_TEXT', note: 'Reply draft', action: 'reply', units: 1 }])
  if (!ok) return { error: notEnough(COST.reply, 0) }
  revalidatePath('/app', 'layout')
  return { text }
}
