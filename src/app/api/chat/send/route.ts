import { z } from 'zod'
import { chatAvailable, conversationToken, newChatAllowed, publicMessage, startConversation, tokenConversation, visitorSays } from '@/lib/chatbot'
import { prisma } from '@/lib/prisma'
import { overLimit } from '@/lib/rate-limit'
import { readBody } from '@/lib/read-body'
import { CORS, corsJson, fromLoudpilot, hostAllowed, identity, isPreview, requestMeta } from '@/lib/tag'

// A visitor's message from the chat widget (/w.js). The first one starts the
// conversation and returns its token; the answer comes back in the response.
const schema = z.object({
  token: z.string().max(400).optional(),
  s: z.string().max(40),
  v: z.string().min(8).max(64),
  url: z.string().max(2000).optional(),
  id: identity.optional(),
  preview: z.string().max(400).optional(),
  text: z.string().trim().min(1).max(2000),
})

// New conversations per visitor IP and site (each one can cost the owner a credit).
const NEW_CHATS_PER_HOUR = 5

const fail = (status: number, code: string, message: string) => corsJson({ error: { code, message } }, status)

export async function POST(req: Request) {
  const meta = requestMeta(req)
  if (overLimit(`chat:${meta.ip ?? 'unknown'}`, 30, 60_000)) return fail(429, 'rate_limited', 'Too many messages. Wait a minute.')
  const raw = await readBody(req)
  if (raw === null) return fail(413, 'too_large', 'Message too large')
  let body: z.infer<typeof schema>
  try {
    body = schema.parse(JSON.parse(raw))
  } catch {
    return fail(400, 'invalid_request', 'Invalid message')
  }
  const origin = req.headers.get('origin') ?? req.headers.get('referer')
  const site = await prisma.site.findUnique({ where: { key: body.s }, include: { workspace: { include: { chatBot: true, account: true } } } })
  const bot = site?.workspace.chatBot
  // The owner's preview (free, before the bot is on) works only on Loudpilot's demo shop.
  const preview = !!site && isPreview(body.preview, site.id) && !site.workspace.account?.pausedAt && fromLoudpilot(origin)
  if (!site || !bot || !(chatAvailable(bot, site.workspace.account) || preview)) return fail(404, 'chat_off', 'Chat is not available')
  if (!hostAllowed(site.domains, origin)) return fail(403, 'domain', 'Chat is not available on this site')

  const id = tokenConversation(body.token)
  let conv = id ? await prisma.chatConversation.findFirst({ where: { id, siteId: site.id } }) : null
  if (body.token && !conv) return fail(404, 'unknown_conversation', 'This chat has ended')
  if (conv && overLimit(`chat-conv:${conv.id}`, 20, 60_000)) return fail(429, 'rate_limited', 'Too many messages. Wait a minute.')
  if (!conv && !preview && overLimit(`chat-new:${site.id}:${meta.ip ?? 'unknown'}`, NEW_CHATS_PER_HOUR, 3_600_000))
    return fail(429, 'rate_limited', 'Too many new chats. Try again later.')
  if (!conv && !(await newChatAllowed(site, preview))) return fail(429, 'rate_limited', 'Too many new chats on this site today. Try again later.')
  conv ??= await startConversation(site, { v: body.v, url: body.url, id: body.id, test: preview })

  const out = await visitorSays(site, conv, body.text, { url: body.url, id: body.id })
  return corsJson({ token: conversationToken(conv.id), status: out.conv.status, messages: out.messages.map(publicMessage) })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
