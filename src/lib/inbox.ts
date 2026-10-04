import 'server-only'
import type { Prisma, SocialAccount } from '@prisma/client'
import { decrypt } from './crypto'
import { graph, MetaError } from './meta'
import { ACTIVE_WORKSPACE } from './pause'
import { prisma } from './prisma'

// Direct messages from Facebook Pages (Messenger) and Instagram professional
// accounts, read with the Conversations API (the 20 most recent messages of
// the most recent threads) and answered with the Send API.

export const INBOX_SCOPES = {
  FACEBOOK: ['pages_messaging', 'pages_manage_metadata'],
  INSTAGRAM: ['instagram_manage_messages', 'pages_manage_metadata'],
} as const

type InboxNetwork = keyof typeof INBOX_SCOPES

export const inboxNetwork = (n: string): n is InboxNetwork => n === 'FACEBOOK' || n === 'INSTAGRAM'

// Granted when the account was connected; reconnecting adds new ones.
export const canMessage = (a: Pick<SocialAccount, 'network' | 'scopes'>) =>
  inboxNetwork(a.network) && INBOX_SCOPES[a.network].every((s) => a.scopes.includes(s))

// Instagram threads live on the linked Facebook Page.
const pageOf = (a: SocialAccount) => (a.network === 'INSTAGRAM' ? a.parentId : a.externalId)

type RawMessage = {
  id: string
  message?: string
  created_time: string
  from?: { id: string; name?: string; username?: string }
  attachments?: { data?: { mime_type?: string; image_data?: { url?: string }; file_url?: string; video_data?: { url?: string } }[] }
}
type RawConversation = {
  id: string
  updated_time: string
  unread_count?: number
  participants?: { data?: { id: string; name?: string; username?: string }[] }
  messages?: { data?: RawMessage[] }
}

const attachmentsOf = (m: RawMessage) => {
  const list = (m.attachments?.data ?? []).flatMap((a) => {
    const url = a.image_data?.url ?? a.video_data?.url ?? a.file_url
    return url ? [{ type: a.mime_type?.split('/')[0] ?? 'file', url }] : []
  })
  return list.length ? list : undefined
}

// Missing permission or a feature not enabled: show it, don't expire the account.
const inboxProblem = (e: unknown) => {
  if (!(e instanceof MetaError)) return e instanceof Error ? e.message : String(e)
  if (e.code === 190 || e.code === 102) return null // token: handled by reconnect alerts elsewhere
  return e.message
}

export async function syncInbox(accountId: string, now = new Date()) {
  const acc = await prisma.socialAccount.findUnique({ where: { id: accountId } })
  if (!acc || acc.status !== 'ACTIVE' || !acc.accessTokenEnc || !canMessage(acc)) return 0
  const pageId = pageOf(acc)
  if (!pageId) return 0
  const token = decrypt(acc.accessTokenEnc)
  // The account's own id in message.from.
  const selfId = acc.network === 'INSTAGRAM' ? acc.externalId : pageId

  let threads: RawConversation[]
  try {
    const r = await graph<{ data: RawConversation[] }>(`${pageId}/conversations`, {
      token,
      params: {
        platform: acc.network === 'INSTAGRAM' ? 'instagram' : 'messenger',
        fields: 'id,updated_time,unread_count,participants,messages.limit(20){id,message,created_time,from,attachments}',
        limit: 30,
      },
    })
    threads = r.data
  } catch (e) {
    const problem = inboxProblem(e)
    await prisma.socialAccount.update({ where: { id: acc.id }, data: { inboxSyncedAt: now, inboxError: problem?.slice(0, 500) ?? null } })
    return 0
  }

  for (const t of threads) {
    const other = (t.participants?.data ?? []).find((p) => p.id !== selfId)
    if (!other) continue
    const messages = (t.messages?.data ?? []).filter((m) => m.message || m.attachments?.data?.length)
    const newest = messages[0]
    const conv = await prisma.conversation.upsert({
      where: { socialAccountId_externalId: { socialAccountId: acc.id, externalId: t.id } },
      create: {
        workspaceId: acc.workspaceId,
        socialAccountId: acc.id,
        network: acc.network,
        externalId: t.id,
        participantId: other.id,
        participantName: other.name || (other.username ? `@${other.username}` : 'Unknown'),
        lastMessageAt: new Date(newest?.created_time ?? t.updated_time),
      },
      update: { participantName: other.name || (other.username ? `@${other.username}` : 'Unknown') },
    })
    for (const m of messages) {
      const data = {
        fromMe: m.from?.id === selfId,
        text: m.message ?? '',
        attachments: attachmentsOf(m) as Prisma.InputJsonValue | undefined,
        sentAt: new Date(m.created_time),
      }
      await prisma.message.upsert({
        where: { conversationId_externalId: { conversationId: conv.id, externalId: m.id } },
        create: { conversationId: conv.id, externalId: m.id, ...data },
        update: { text: data.text, attachments: data.attachments },
      })
    }
    await refreshConversation(conv.id)
  }
  await prisma.socialAccount.update({ where: { id: acc.id }, data: { inboxSyncedAt: now, inboxError: null } })
  return threads.length
}

// Last message, preview and unread count from the stored messages.
async function refreshConversation(id: string) {
  const conv = await prisma.conversation.findUniqueOrThrow({ where: { id } })
  const last = await prisma.message.findFirst({ where: { conversationId: id }, orderBy: { sentAt: 'desc' } })
  const unread = await prisma.message.count({
    where: { conversationId: id, fromMe: false, ...(conv.readAt ? { sentAt: { gt: conv.readAt } } : {}) },
  })
  await prisma.conversation.update({
    where: { id },
    data: {
      unread,
      ...(last && { lastMessageAt: last.sentAt, lastText: last.text || (last.attachments ? 'Attachment' : ''), lastFromMe: last.fromMe }),
    },
  })
}

export async function markRead(workspaceId: string, conversationId: string) {
  await prisma.conversation.updateMany({ where: { id: conversationId, workspaceId }, data: { readAt: new Date(), unread: 0 } })
}

export class InboxError extends Error {}

// Reply in the thread. Meta allows standard replies within 24 hours of the
// person's last message.
export async function sendReply(workspaceId: string, conversationId: string, text: string, userId: string) {
  const body = text.trim()
  if (!body) throw new InboxError('Write a message')
  if (body.length > 2000) throw new InboxError('Messages can be up to 2,000 characters')
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId }, include: { socialAccount: true } })
  if (!conv) throw new InboxError('Conversation not found')
  const acc = conv.socialAccount
  if (acc.status !== 'ACTIVE' || !acc.accessTokenEnc) throw new InboxError(`Reconnect ${acc.name} in Channels to reply`)
  if (!canMessage(acc)) throw new InboxError(`Reconnect ${acc.name} and allow messages to reply`)
  const pageId = pageOf(acc)
  if (!pageId) throw new InboxError('This account has no Facebook Page')

  let sent: { message_id?: string }
  try {
    sent = await graph<{ message_id?: string }>(`${pageId}/messages`, {
      token: decrypt(acc.accessTokenEnc),
      method: 'POST',
      params: {
        recipient: JSON.stringify({ id: conv.participantId }),
        messaging_type: 'RESPONSE',
        message: JSON.stringify({ text: body }),
      },
    })
  } catch (e) {
    if (e instanceof MetaError && (e.subcode === 2018278 || e.subcode === 2534022 || /outside of allowed window|24 hour/i.test(e.message))) {
      throw new InboxError('More than 24 hours passed since their last message — Meta only lets you reply within 24 hours. Answer in the Meta Business Suite app.')
    }
    if (e instanceof MetaError) throw new InboxError(`Meta refused the message: ${e.message}`)
    throw e
  }
  const msg = await prisma.message.create({
    data: { conversationId: conv.id, externalId: sent.message_id ?? `local-${Date.now()}`, fromMe: true, text: body, sentAt: new Date(), sentById: userId },
  })
  await prisma.conversation.update({ where: { id: conv.id }, data: { readAt: new Date() } })
  await refreshConversation(conv.id)
  return msg
}

// Ticker: accounts with messaging allowed, read every 2 minutes.
export async function syncInboxDue(now = new Date(), limit = 20) {
  const due = await prisma.socialAccount.findMany({
    where: {
      network: { in: ['FACEBOOK', 'INSTAGRAM'] },
      status: 'ACTIVE',
      scopes: { has: 'pages_manage_metadata' },
      workspace: ACTIVE_WORKSPACE,
      OR: [{ inboxSyncedAt: null }, { inboxSyncedAt: { lt: new Date(now.getTime() - 2 * 60 * 1000) } }],
    },
    orderBy: { inboxSyncedAt: { sort: 'asc', nulls: 'first' } },
    take: limit,
    select: { id: true },
  })
  let n = 0
  for (const a of due) n += await syncInbox(a.id, now).catch((e) => (console.error('inbox sync failed', a.id, e), 0))
  return n
}
