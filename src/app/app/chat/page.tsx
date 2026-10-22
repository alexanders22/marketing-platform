import type { Metadata } from 'next'
import Link from 'next/link'
import { Globe, MessagesSquare } from 'lucide-react'
import type { Prisma } from '@prisma/client'
import { EmptyState } from '@/components/EmptyState'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'
import { visitLabel } from '@/lib/tag-report'
import { When } from '../inbox/Thread'
import { ChatThread, LiveChats } from './ChatThread'
import { ShowMore } from '@/components/ShowMore'

export const metadata: Metadata = { title: 'Website chat — Loudpilot' }

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'HUMAN', label: 'Needs a person' },
  { id: 'BOT', label: 'Assistant' },
  { id: 'CLOSED', label: 'Closed' },
]

export default async function ChatPage({ searchParams }: PageProps<'/app/chat'>) {
  const { workspace, user } = await requireContext()
  const sp = await searchParams
  const filter = FILTERS.some((f) => f.id === sp.f) ? String(sp.f) : 'all'
  const selectedId = typeof sp.c === 'string' ? sp.c : undefined
  const operators = await prisma.chatOperator.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true, email: true } } } })
  const me = operators.find((o) => o.userId === user.id)
  const where: Prisma.ChatConversationWhereInput = {
    workspaceId: workspace.id,
    ...(filter === 'mine' ? { operatorId: me?.id ?? '-' } : filter !== 'all' ? { status: filter } : {}),
  }
  const opName = (id: string | null) => {
    const o = operators.find((x) => x.id === id)
    return o ? o.user.name || o.user.email : null
  }
  const [conversations, selected, bot] = await Promise.all([
    prisma.chatConversation.findMany({ where, orderBy: { lastMessageAt: 'desc' }, take: 100 }),
    selectedId
      ? prisma.chatConversation.findFirst({
          where: { id: selectedId, workspaceId: workspace.id },
          include: {
            messages: { orderBy: { createdAt: 'asc' }, take: 200 },
            visitor: { include: { visits: { orderBy: { startedAt: 'desc' }, take: 3 } } },
          },
        })
      : null,
    prisma.chatBot.findUnique({ where: { workspaceId: workspace.id } }),
  ])
  const link = (p: { c?: string; f?: string }) => {
    const u = new URLSearchParams()
    const f = p.f ?? filter
    if (f !== 'all') u.set('f', f)
    if (p.c) u.set('c', p.c)
    const s = u.toString()
    return `/app/chat${s ? `?${s}` : ''}`
  }

  if (!bot && conversations.length === 0) {
    return (
      <>
        <h1 className="sr-only">Website chat</h1>
        <EmptyState
          icon={Globe}
          title="Add a chat to your website"
          action={
            <Link href="/app/chat/settings" className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">
              Set up the assistant
            </Link>
          }
        >
          An assistant answers visitors from what you teach it and hands the hard questions to you. Their chats land here, and you answer without leaving Loudpilot.
        </EmptyState>
      </>
    )
  }

  return (
    <div className="grid min-h-[70vh] overflow-hidden rounded-2xl border border-zinc-200 bg-white lg:grid-cols-[320px_1fr]">
      <h1 className="sr-only">Website chat</h1>
      <section className="border-b border-zinc-200 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-zinc-200 p-2">
          {FILTERS.map((f) => (
            <Link key={f.id} href={link({ f: f.id, c: undefined })} aria-current={f.id === filter ? 'page' : undefined} className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${f.id === filter ? 'bg-zinc-100' : 'text-zinc-500 hover:text-zinc-900'}`}>
              {f.label}
            </Link>
          ))}
          <LiveChats />
        </div>
        {conversations.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-zinc-500">No chats here yet.</p>
        ) : (
          <ul aria-label="Chats" className="max-h-[calc(100vh-12rem)] divide-y divide-zinc-100 overflow-y-auto">
            <ShowMore as="li">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link href={link({ c: c.id })} className={`flex gap-3 px-3 py-3 ${c.id === selectedId ? 'bg-zinc-100' : 'hover:bg-zinc-50'}`}>
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${c.status === 'HUMAN' ? 'bg-amber-500' : c.status === 'BOT' ? 'bg-indigo-500' : 'bg-zinc-300'}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={`min-w-0 flex-1 truncate text-sm ${c.unread ? 'font-semibold' : 'font-medium'}`}>
                          {c.name || c.phone || c.email || (c.userId ? `Customer ${c.userId}` : 'Visitor')}
                          {c.test && <span className="ml-1.5 rounded bg-zinc-100 px-1 text-[10px] font-normal text-zinc-500">test</span>}
                        </span>
                        <span className="shrink-0 text-[11px] text-zinc-500">
                          <When iso={c.lastMessageAt.toISOString()} />
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className={`min-w-0 flex-1 truncate text-xs ${c.unread ? 'text-zinc-900' : 'text-zinc-500'}`}>{c.lastText}</span>
                        {opName(c.operatorId) && <span className="max-w-[96px] shrink-0 truncate rounded bg-amber-50 px-1.5 text-[10px] text-amber-800">{opName(c.operatorId)}</span>}
                        {c.unread > 0 && <span className="rounded-full bg-indigo-600 px-1.5 py-px text-[11px] font-semibold text-white">{c.unread}</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ShowMore>
          </ul>
        )}
      </section>

      <section className="flex min-h-[60vh] flex-col">
        {selected ? (
          <ChatThread
            key={selected.id}
            conversation={{
              id: selected.id,
              status: selected.status,
              unread: selected.unread,
              name: selected.name,
              email: selected.email,
              phone: selected.phone,
              userId: selected.userId,
              pageUrl: selected.pageUrl,
              reason: selected.handoffReason,
              test: selected.test,
              operatorId: selected.operatorId,
              came: selected.visitor?.visits.map((v) => ({ at: v.startedAt.toISOString(), label: visitLabel(v) })) ?? [],
            }}
            operators={operators.map((o) => ({ id: o.id, name: o.user.name || o.user.email }))}
            messages={selected.messages.map((m) => ({
              id: m.id,
              role: m.role,
              text: m.text,
              at: m.createdAt.toISOString(),
              lookups: ((m.tools as { action: string; ok: boolean }[] | null) ?? []).map((t) => `${t.action}${t.ok ? '' : ' (failed)'}`),
            }))}
          />
        ) : (
          <EmptyState icon={MessagesSquare} title="Pick a chat">
            Amber dot: the assistant handed it to you. Answer here — the visitor sees it in the chat on your website.
          </EmptyState>
        )}
      </section>
    </div>
  )
}
