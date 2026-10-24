'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireContext } from '@/lib/context'
import { encrypt } from '@/lib/crypto'
import { tokenFor } from '@/lib/networks'
import { boardsOf } from '@/lib/networks/pinterest'
import { chatName, findChannel, newStartCode, PLATFORM_BOT, platformBot, runsChannel, spendStartCode, startedWith, telegramBotName } from '@/lib/networks/telegram'
import { creatorInfo } from '@/lib/networks/tiktok'
import { NetworkError } from '@/lib/networks/types'
import { limitsFor, serviceOff, serviceOn } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { countProfiles } from '@/lib/profiles'

const TelegramInput = z.object({
  // @name, t.me/name or a numeric id (-100…).
  channel: z
    .string()
    .trim()
    .min(2, 'Enter the channel, e.g. @yourchannel')
    .max(200)
    .transform((v) => {
      const m = v.match(/(?:t\.me\/|^@?)([A-Za-z0-9_]{4,64})$/)
      return /^-?\d+$/.test(v) ? v : m ? `@${m[1]}` : v
    }),
  botToken: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !v || /^\d+:[A-Za-z0-9_-]{30,}$/.test(v), 'That doesn’t look like a bot token from @BotFather')
    .optional()
    .default(''),
})

// The Start link that shows who connects a channel through Loudpilot's bot:
// pressed from the person's own Telegram, it tells the bot their account.
const proofTarget = (userId: string) => `channel:${userId}`
async function proofLink(workspaceId: string, userId: string) {
  const name = await telegramBotName()
  return name ? `https://t.me/${name}?start=${await newStartCode(workspaceId, proofTarget(userId))}` : undefined
}

export async function telegramProofLink(): Promise<{ error?: string; link?: string }> {
  const { workspace, role, user } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only owners and admins can change channels' }
  const link = await proofLink(workspace.id, user.id)
  return link ? { link } : { error: 'Loudpilot’s Telegram bot is not available — use your own bot token.' }
}

// Connect a Telegram channel: the bot (Loudpilot's or the company's own)
// must already be an admin with "Post messages". With Loudpilot's bot the
// person must also have pressed Start in it from a Telegram account that
// runs the channel, and the channel can't be in another Loudpilot account.
// (Only a channel's admins can make the company's own bot an admin.)
// `link`: a fresh Start link when the proof failed.
export async function connectTelegram(raw: z.input<typeof TelegramInput>): Promise<{ error?: string; name?: string; link?: string }> {
  const { workspace, role, account, user } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only owners and admins can change channels' }
  const parsed = TelegramInput.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the channel' }
  const { channel, botToken } = parsed.data
  if (!serviceOn(account)) return { error: serviceOff(account) }
  if (!botToken && !platformBot()) return { error: 'Paste your bot token from @BotFather' }
  const stored = botToken || PLATFORM_BOT
  let found
  try {
    found = await findChannel(stored, channel)
  } catch (e) {
    return { error: e instanceof NetworkError ? e.message : 'Telegram did not answer — try again' }
  }

  let proof: string | null = null
  if (!botToken) {
    const refused = async (error: string) => ({ error, link: await proofLink(workspace.id, user.id) })
    const started = await startedWith(workspace.id, proofTarget(user.id))
    if (!started) return refused(`Open @${found.bot} from your own Telegram and press Start (step 2), then connect again.`)
    if ('error' in started) return refused(started.error)
    if (started.chat.type !== 'private' || !started.from) return refused(`Press Start in a private chat with @${found.bot}, not in a group.`)
    let runs
    try {
      runs = await runsChannel(stored, found.externalId, started.from.id)
    } catch (e) {
      return { error: e instanceof NetworkError ? e.message : 'Telegram did not answer — try again' }
    }
    if (!runs) {
      await spendStartCode(started.codeId)
      return refused(`Your Telegram account (${chatName(started.from)}) is not an admin of ${found.name} who can post. Press Start from the account that runs the channel.`)
    }
    proof = started.codeId
  }

  const limit = limitsFor(account).profiles
  const data = { name: found.name, handle: found.handle, meta: { bot: found.bot, ownBot: !!botToken }, accessTokenEnc: encrypt(stored), scopes: ['post'], status: 'ACTIVE' as const, lastError: null }
  // One connect at a time per company, so two can't both use the last place;
  // and per channel, so two accounts can't both take it.
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${'profiles:' + workspace.id}))`
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${'telegram:' + found.externalId}))`
    if (!botToken) {
      const others = await tx.socialAccount.findMany({ where: { network: 'TELEGRAM', externalId: found.externalId }, select: { meta: true, workspace: { select: { accountId: true } } } })
      if (others.some((o) => o.workspace.accountId !== account.id && (o.meta as { ownBot?: boolean } | null)?.ownBot !== true)) return 'taken'
    }
    const where = { workspaceId_network_externalId: { workspaceId: workspace.id, network: 'TELEGRAM' as const, externalId: found.externalId } }
    const existing = await tx.socialAccount.findUnique({ where })
    if (!existing && (await countProfiles(workspace.id, tx)) >= limit) return 'full'
    if (proof && !(await spendStartCode(proof, tx))) return 'spent'
    await tx.socialAccount.upsert({ where, create: { workspaceId: workspace.id, network: 'TELEGRAM', externalId: found.externalId, ...data }, update: data })
    return 'ok'
  })
  if (outcome === 'taken')
    return { error: `${found.name} is already connected to another Loudpilot account through @${found.bot}. Ask them to disconnect it, or connect it with your own bot token.` }
  if (outcome === 'full') return { error: `Your plan includes ${limit} social profiles per company. Disconnect one or upgrade to add more.` }
  if (outcome === 'spent') return { error: 'That Start link was already used. Press Start with the new link, then connect again.', link: await proofLink(workspace.id, user.id) }
  revalidatePath('/app', 'layout')
  return { name: found.name }
}

export async function setPinterestBoard(accountId: string, boardId: string): Promise<{ error?: string }> {
  const { workspace, role } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only owners and admins can change channels' }
  const a = await prisma.socialAccount.findFirst({ where: { id: accountId, workspaceId: workspace.id, network: 'PINTEREST' } })
  if (!a || !boardsOf(a).some((b) => b.id === boardId)) return { error: 'Board not found' }
  await prisma.socialAccount.update({ where: { id: a.id }, data: { meta: { ...((a.meta ?? {}) as object), board: boardId } } })
  revalidatePath('/app/channels')
  return {}
}

// What TikTok allows this creator right now: for the TikTok settings in the post editor.
export async function tiktokCreator(): Promise<{ error?: string; creators?: { id: string; nickname: string; privacy: string[]; comment: boolean; duet: boolean; stitch: boolean; maxSeconds: number }[] }> {
  const { workspace } = await requireContext()
  const accounts = await prisma.socialAccount.findMany({ where: { workspaceId: workspace.id, network: 'TIKTOK', status: 'ACTIVE' } })
  try {
    const creators = await Promise.all(
      accounts.map(async (a) => {
        const i = await creatorInfo(await tokenFor(a))
        return { id: a.id, nickname: i.creator_nickname, privacy: i.privacy_level_options, comment: !i.comment_disabled, duet: !i.duet_disabled, stitch: !i.stitch_disabled, maxSeconds: i.max_video_post_duration_sec }
      }),
    )
    return { creators }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'TikTok did not answer' }
  }
}
