'use server'

import { createHmac } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { aiEnabled, LANGUAGES, writeChatSetup } from '@/lib/ai'
import { aiError } from '@/lib/ai-health'
import { CHAT_LANGUAGES } from '@/lib/chat-languages'
import { actionKey, botActions, callAction, setConversationStatus, teamReply, type BotAction } from '@/lib/chatbot'
import { requireContext } from '@/lib/context'
import { balanceOf, charge, notEnough, prices } from '@/lib/credits'
import { crawlSite, withDossier } from '@/lib/dossier'
import { platformBot, telegramBotName, tg } from '@/lib/networks/telegram'
import { prisma } from '@/lib/prisma'
import { ensureSite, normEmail } from '@/lib/tag'

const manager = async () => {
  const ctx = await requireContext()
  if (ctx.role === 'EDITOR' && !ctx.asAdmin) throw new Error('Only the owner or an admin can change the assistant.')
  return ctx
}

const ensureBot = (workspaceId: string) => prisma.chatBot.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} })

/* ─── Conversations ────────────────────────────────────────────────────── */

export async function sendTeamReply(conversationId: string, text: string): Promise<{ error?: string }> {
  const { workspace, user } = await requireContext()
  const t = text.trim()
  if (!t) return { error: 'Write a message first.' }
  try {
    await teamReply(workspace.id, conversationId, t, user.id)
  } catch {
    return { error: 'Conversation not found.' }
  }
  revalidatePath('/app/chat')
  return {}
}

export async function changeStatus(conversationId: string, status: 'BOT' | 'HUMAN' | 'CLOSED') {
  const { workspace } = await requireContext()
  await setConversationStatus(workspace.id, conversationId, status)
  revalidatePath('/app/chat')
}

export async function markChatRead(conversationId: string) {
  const { workspace } = await requireContext()
  await prisma.chatConversation.updateMany({ where: { id: conversationId, workspaceId: workspace.id }, data: { unread: 0 } })
  revalidatePath('/app', 'layout')
}

/* ─── Assistant settings ───────────────────────────────────────────────── */

export type BotSettings = {
  enabled: boolean
  name: string
  greeting: string
  instructions: string
  knowledge: string
  languages: string[]
  redFlags: string
  color: string
  position: 'right' | 'left'
  notifyEmails: string
  actionsUrl: string
  actions: BotAction[]
}

export async function saveBot(s: BotSettings): Promise<{ error?: string }> {
  let ctx
  try {
    ctx = await manager()
  } catch (e) {
    return { error: (e as Error).message }
  }
  const emails = s.notifyEmails.split(/[\s,;]+/).filter(Boolean)
  const bad = emails.find((e) => !normEmail(e))
  if (bad) return { error: `"${bad}" is not an e-mail address.` }
  let actionsUrl: string | null = s.actionsUrl.trim() || null
  if (actionsUrl) {
    try {
      const u = new URL(actionsUrl)
      if (u.protocol !== 'https:' && process.env.NODE_ENV === 'production') return { error: 'The data endpoint must use https://.' }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'The data endpoint must be an https:// address.' }
      actionsUrl = u.toString()
    } catch {
      return { error: 'The data endpoint is not a valid address.' }
    }
  }
  const actions = botActions({ actions: s.actions.map((a) => ({ ...a, key: actionKey(a.key) })) })
  if (new Set(actions.map((a) => a.key)).size !== actions.length) return { error: 'Two data lookups have the same name.' }
  if (actions.some((a) => !a.description.trim())) return { error: 'Describe when the assistant should use each lookup.' }
  await ensureSite(ctx.workspace.id)
  await ensureBot(ctx.workspace.id)
  await prisma.chatBot.update({
    where: { workspaceId: ctx.workspace.id },
    data: {
      enabled: s.enabled,
      name: s.name.trim().slice(0, 40) || 'Assistant',
      greeting: s.greeting.trim().slice(0, 300),
      instructions: s.instructions.trim().slice(0, 6000),
      knowledge: s.knowledge.trim().slice(0, 12000),
      languages: s.languages.filter((l) => CHAT_LANGUAGES.includes(l)),
      redFlags: s.redFlags.split('\n').map((x) => x.trim().slice(0, 120)).filter(Boolean).slice(0, 20),
      color: /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : '#4f46e5',
      position: s.position === 'left' ? 'left' : 'right',
      notifyEmails: emails.map((e) => normEmail(e)!),
      actionsUrl,
      actions,
    },
  })
  revalidatePath('/app/chat/settings')
  return {}
}

// The brief written from the website (and what Loudpilot knows already).
export async function writeFromWebsite(language: string): Promise<{ error?: string; setup?: { instructions: string; knowledge: string; greeting: string; redFlags: string } }> {
  let ctx
  try {
    ctx = await manager()
  } catch (e) {
    return { error: (e as Error).message }
  }
  const { workspace, account, brand } = ctx
  const COST = await prices()
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  const have = await balanceOf(account.id)
  if (have < COST.chatSetup) return { error: notEnough(COST.chatSetup, have) }
  const pages = brand?.website ? await crawlSite(brand.website, 8).catch(() => []) : []
  const lang = LANGUAGES.find((l) => l === language) ?? 'English'
  let setup
  try {
    setup = await writeChatSetup(workspace.name, await withDossier(brand, workspace.id), pages, lang)
  } catch (e) {
    console.error('writeChatSetup failed', e)
    return { error: aiError(e, 'The assistant brief could not be written. Try again.') }
  }
  const ok = await charge(account.id, workspace.id, [{ amount: COST.chatSetup, reason: 'AI_TEXT', note: 'Website assistant set-up', action: 'chatSetup', units: 1 }])
  if (!ok) return { error: notEnough(COST.chatSetup, 0) }
  revalidatePath('/app', 'layout')
  return { setup: { ...setup, redFlags: setup.redFlags.join('\n') } }
}

// Sends one lookup to the company's endpoint, as the assistant would.
export async function testLookup(
  url: string,
  action: BotAction,
  params: Record<string, string>,
  asCustomer: string,
): Promise<{ error?: string; ms?: number; response?: unknown }> {
  let ctx
  try {
    ctx = await manager()
  } catch (e) {
    return { error: (e as Error).message }
  }
  try {
    new URL(url)
  } catch {
    return { error: 'Enter the endpoint address first.' }
  }
  const site = await ensureSite(ctx.workspace.id)
  const clean = botActions({ actions: [action] })[0]
  if (!clean) return { error: 'Give the lookup a name.' }
  const r = await callAction(url, site, { id: `test-${Date.now()}`, userId: asCustomer.trim() || null, test: true }, clean, params)
  return { ms: r.ms, response: r.response }
}

/* ─── Telegram hand-over alerts ────────────────────────────────────────── */

// Static per company: "/start <code>" sent to Loudpilot's bot links a chat.
const telegramCode = (workspaceId: string) => createHmac('sha256', `tg-chat:${process.env.KHMA_ENCRYPTION_KEY}`).update(workspaceId).digest('hex').slice(0, 24)

export async function telegramLinks(): Promise<{ error?: string; person?: string; group?: string }> {
  const { workspace } = await requireContext()
  const name = await telegramBotName()
  if (!name) return { error: 'Telegram alerts are not available on this server yet (no Loudpilot bot).' }
  const code = telegramCode(workspace.id)
  return { person: `https://t.me/${name}?start=${code}`, group: `https://t.me/${name}?startgroup=${code}` }
}

type Update = { update_id: number; message?: { text?: string; chat: { id: number; title?: string; username?: string; first_name?: string; type: string } } }

export async function connectTelegram(): Promise<{ error?: string; name?: string }> {
  let ctx
  try {
    ctx = await manager()
  } catch (e) {
    return { error: (e as Error).message }
  }
  if (!platformBot()) return { error: 'Telegram alerts are not available on this server yet.' }
  const code = telegramCode(ctx.workspace.id)
  let updates: Update[]
  try {
    updates = await tg<Update[]>(platformBot(), 'getUpdates', { allowed_updates: ['message'], limit: 100 })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Telegram did not answer.' }
  }
  const hit = [...updates].reverse().find((u) => new RegExp(`^/start(@\\w+)?\\s+${code}$`).test(u.message?.text?.trim() ?? ''))
  if (!hit?.message) return { error: 'No message from you yet. Open the link, press Start (or add the bot to your group), then try again.' }
  const chat = hit.message.chat
  const name = chat.title ?? (chat.username ? `@${chat.username}` : chat.first_name ?? 'Telegram chat')
  await ensureBot(ctx.workspace.id)
  await prisma.chatBot.update({ where: { workspaceId: ctx.workspace.id }, data: { telegramChatId: String(chat.id), telegramName: name } })
  await tg(platformBot(), 'sendMessage', { chat_id: chat.id, text: `✅ Loudpilot will send website-chat hand-overs for ${ctx.workspace.name} here.` }).catch(() => {})
  revalidatePath('/app/chat/settings')
  return { name }
}

export async function disconnectTelegram(): Promise<{ error?: string }> {
  try {
    const ctx = await manager()
    await prisma.chatBot.updateMany({ where: { workspaceId: ctx.workspace.id }, data: { telegramChatId: null, telegramName: null } })
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath('/app/chat/settings')
  return {}
}
