import { z } from 'zod'
import { publicMessage, tokenConversation } from '@/lib/chatbot'
import { prisma } from '@/lib/prisma'
import { overLimit } from '@/lib/rate-limit'
import { CORS, corsJson, requestMeta } from '@/lib/tag'

// New messages in a conversation (a teammate's answers), for the widget.
const schema = z.object({ token: z.string().max(400), after: z.string().max(40).nullish() })

export async function POST(req: Request) {
  const meta = requestMeta(req)
  if (overLimit(`chat-poll:${meta.ip ?? 'unknown'}`, 120, 60_000)) return corsJson({ error: { code: 'rate_limited', message: 'Slow down' } }, 429)
  let body: z.infer<typeof schema>
  try {
    body = schema.parse(JSON.parse(await req.text()))
  } catch {
    return corsJson({ error: { code: 'invalid_request', message: 'Invalid request' } }, 400)
  }
  const id = tokenConversation(body.token)
  const conv = id ? await prisma.chatConversation.findUnique({ where: { id } }) : null
  if (!conv) return corsJson({ error: { code: 'unknown_conversation', message: 'This chat has ended' } }, 404)
  const after = body.after && !Number.isNaN(Date.parse(body.after)) ? new Date(body.after) : null
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId: conv.id, ...(after ? { createdAt: { gt: after } } : {}) },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })
  return corsJson({ status: conv.status, messages: messages.map(publicMessage) })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
