'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireContext } from '@/lib/context'
import { encrypt } from '@/lib/crypto'
import { tokenFor } from '@/lib/networks'
import { boardsOf } from '@/lib/networks/pinterest'
import { findChannel, PLATFORM_BOT, platformBot } from '@/lib/networks/telegram'
import { creatorInfo } from '@/lib/networks/tiktok'
import { NetworkError } from '@/lib/networks/types'
import { planLimits } from '@/lib/plans'
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

// Connect a Telegram channel: the bot (Loudpilot's or the company's own)
// must already be an admin with "Post messages".
export async function connectTelegram(raw: z.input<typeof TelegramInput>): Promise<{ error?: string; name?: string }> {
  const { workspace, role, account } = await requireContext()
  if (role === 'EDITOR') return { error: 'Only owners and admins can change channels' }
  const parsed = TelegramInput.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the channel' }
  const { channel, botToken } = parsed.data
  if (!botToken && !platformBot()) return { error: 'Paste your bot token from @BotFather' }
  const stored = botToken || PLATFORM_BOT
  let found
  try {
    found = await findChannel(stored, channel)
  } catch (e) {
    return { error: e instanceof NetworkError ? e.message : 'Telegram did not answer — try again' }
  }
  const existing = await prisma.socialAccount.findUnique({
    where: { workspaceId_network_externalId: { workspaceId: workspace.id, network: 'TELEGRAM', externalId: found.externalId } },
  })
  if (!existing && (await countProfiles(account.id)) >= planLimits(account.plan).profiles)
    return { error: `Your plan includes ${planLimits(account.plan).profiles} social profiles. Disconnect one or upgrade to add more.` }
  const data = { name: found.name, handle: found.handle, meta: { bot: found.bot, ownBot: !!botToken }, accessTokenEnc: encrypt(stored), scopes: ['post'], status: 'ACTIVE' as const, lastError: null }
  await prisma.socialAccount.upsert({
    where: { workspaceId_network_externalId: { workspaceId: workspace.id, network: 'TELEGRAM', externalId: found.externalId } },
    create: { workspaceId: workspace.id, network: 'TELEGRAM', externalId: found.externalId, ...data },
    update: data,
  })
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
