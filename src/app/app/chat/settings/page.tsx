import type { Metadata } from 'next'
import Link from 'next/link'
import { Bot, Footprints, ShoppingBag } from 'lucide-react'
import { requireContext } from '@/lib/context'
import { botActions } from '@/lib/chatbot'
import { prisma } from '@/lib/prisma'
import { ensureSite } from '@/lib/tag'
import { BotForm } from './BotForm'

export const metadata: Metadata = { title: 'Website assistant — Loudpilot' }

export default async function AssistantPage() {
  const { workspace, role, asAdmin, brand } = await requireContext()
  const canManage = role !== 'EDITOR' || asAdmin
  const [site, bot] = await Promise.all([ensureSite(workspace.id), prisma.chatBot.findUnique({ where: { workspaceId: workspace.id } })])
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto max-w-2xl">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Bot size={22} /> Website assistant
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            A chat on your website that answers customers day and night from what you teach it, looks up orders through your own system, and hands sensitive
            questions to your team on Telegram or e-mail.
          </p>
        </div>
        <a href="/demo-shop" target="_blank" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50">
          <ShoppingBag size={15} /> Try it in the demo shop
        </a>
      </div>

      <p className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200">
        <Footprints size={16} />
        The chat appears on every page with the{' '}
        <Link href="/app/website/tag" className="font-medium text-indigo-600">
          Loudpilot Tag
        </Link>
        {site.lastEventAt ? ' — installed on your site.' : ' — not seen on your site yet: install it first.'}
      </p>

      <BotForm
        canManage={canManage}
        website={brand?.website ?? null}
        telegram={bot?.telegramName ?? null}
        initial={{
          enabled: bot?.enabled ?? false,
          name: bot?.name ?? 'Assistant',
          greeting: bot?.greeting ?? 'Hi! How can I help you?',
          instructions: bot?.instructions ?? '',
          knowledge: bot?.knowledge ?? '',
          languages: bot?.languages ?? [],
          redFlags: (bot?.redFlags ?? []).join('\n'),
          color: bot?.color ?? '#4f46e5',
          position: bot?.position === 'left' ? 'left' : 'right',
          notifyEmails: (bot?.notifyEmails ?? []).join(', '),
          actionsUrl: bot?.actionsUrl ?? '',
          actions: bot ? botActions(bot) : [],
        }}
      />
    </div>
  )
}
