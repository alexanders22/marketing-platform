import 'server-only'
import type { SocialAccount } from '@prisma/client'
import { NetworkError, type Connector, type Outgoing } from './types'

// Telegram channels through the Bot API. The company adds a bot as an admin
// of its channel with "Post messages": Loudpilot's own bot (TELEGRAM_BOT_TOKEN)
// or its own bot from @BotFather. The Bot API gives no view counts.

const BASE = () => (process.env.TELEGRAM_API_URL || 'https://api.telegram.org').replace(/\/$/, '')
export const PLATFORM_BOT = 'platform'
export const platformBot = () => process.env.TELEGRAM_BOT_TOKEN || ''
// @username of Loudpilot's own bot, cached for an hour.
let botName: { name: string | null; at: number } | null = null
export async function telegramBotName() {
  if (!platformBot()) return null
  if (botName && Date.now() - botName.at < 3_600_000) return botName.name
  const me = await tg<{ username: string }>(platformBot(), 'getMe', {}).catch(() => null)
  botName = { name: me?.username ?? null, at: Date.now() }
  return botName.name
}

const botToken = (stored: string) => (stored === PLATFORM_BOT ? platformBot() : stored)

const URL_LIMIT = 20 * 1024 * 1024 // files Telegram fetches by link
const UPLOAD_LIMIT = 50 * 1024 * 1024 // files we upload
const CAPTION = 1024
const MESSAGE = 4096

export async function tg<T>(token: string, method: string, body: Record<string, unknown> | FormData): Promise<T> {
  const res = await fetch(`${BASE()}/bot${token}/${method}`, {
    method: 'POST',
    ...(body instanceof FormData ? { body } : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    signal: AbortSignal.timeout(120_000),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number }
  if (!data.ok) {
    const code = data.error_code ?? res.status
    const msg = data.description ?? `Telegram error ${code}`
    // Bad token, or the bot was removed from the channel / lost its rights.
    throw new NetworkError(code === 403 || code === 401 ? `${msg} — add the bot back as a channel admin with "Post messages"` : msg, code === 401 || code === 403, code)
  }
  return data.result as T
}

type Chat = { id: number; title?: string; username?: string; type: string }
type Message = { message_id: number }

const link = (a: SocialAccount, id: number) =>
  a.handle ? `https://t.me/${a.handle}/${id}` : `https://t.me/c/${a.externalId.replace(/^-100/, '')}/${id}`

// Check the channel and the bot's rights; returns what to save.
export async function findChannel(stored: string, channel: string) {
  const token = botToken(stored)
  if (!token) throw new NetworkError('No bot token')
  const me = await tg<{ id: number; username: string }>(token, 'getMe', {})
  const chat = await tg<Chat>(token, 'getChat', { chat_id: channel }).catch(() => {
    throw new NetworkError(`Telegram can't find ${channel}, or @${me.username} isn't in it yet. Add the bot as a channel admin first.`)
  })
  if (chat.type !== 'channel') throw new NetworkError(`${channel} is a ${chat.type}, not a channel.`)
  const member = await tg<{ status: string; can_post_messages?: boolean }>(token, 'getChatMember', { chat_id: chat.id, user_id: me.id })
  if (member.status !== 'administrator' && member.status !== 'creator')
    throw new NetworkError(`@${me.username} is not an admin of ${chat.title ?? channel}. Add it in the channel settings → Administrators.`)
  if (member.status === 'administrator' && member.can_post_messages === false)
    throw new NetworkError(`@${me.username} can't post in ${chat.title ?? channel}. Turn on "Post messages" for it.`)
  return { externalId: String(chat.id), name: chat.title ?? channel, handle: chat.username ?? null, bot: me.username }
}

async function sendVideo(token: string, chat: string, out: Outgoing, caption?: string) {
  const v = out.video!
  if (v.bytes <= URL_LIMIT) return tg<Message>(token, 'sendVideo', { chat_id: chat, video: v.url, caption, supports_streaming: true })
  if (v.bytes > UPLOAD_LIMIT) throw new NetworkError('Telegram bots can send videos up to 50 MB — use a shorter or smaller video.')
  const f = new FormData()
  f.set('chat_id', chat)
  if (caption) f.set('caption', caption)
  f.set('supports_streaming', 'true')
  f.set('video', new Blob([new Uint8Array(await v.read())], { type: v.mime }), `video.${v.mime.split('/')[1] ?? 'mp4'}`)
  return tg<Message>(token, 'sendVideo', f)
}

export const telegram: Connector = {
  network: 'TELEGRAM',
  label: 'Telegram channel',
  about: 'Posts, photos and videos in your channel',
  setup: [],
  // Works with the company's own bot even without Loudpilot's bot.
  enabled: () => true,
  check: (out) => (out.text.length > MESSAGE ? `Telegram messages are up to ${MESSAGE} characters` : null),
  async publish(a, stored, out) {
    const token = botToken(stored)
    const chat = a.externalId
    if (!out.video && out.images.length === 0) {
      const m = await tg<Message>(token, 'sendMessage', { chat_id: chat, text: out.text })
      return { id: String(m.message_id), permalink: link(a, m.message_id) }
    }
    const fits = out.text.length <= CAPTION
    const caption = fits ? out.text || undefined : undefined
    let first: Message
    if (out.video) first = await sendVideo(token, chat, out, caption)
    else if (out.images.length === 1) first = await tg<Message>(token, 'sendPhoto', { chat_id: chat, photo: out.images[0].url, caption })
    else {
      const sent = await tg<Message[]>(token, 'sendMediaGroup', {
        chat_id: chat,
        media: out.images.slice(0, 10).map((m, i) => ({ type: 'photo', media: m.url, ...(i === 0 && caption ? { caption } : {}) })),
      })
      first = sent[0]
    }
    // A long text doesn't fit under media: it follows as its own message.
    if (!fits && out.text) await tg<Message>(token, 'sendMessage', { chat_id: chat, text: out.text, reply_parameters: { message_id: first.message_id } })
    return { id: String(first.message_id), permalink: link(a, first.message_id) }
  },
}
