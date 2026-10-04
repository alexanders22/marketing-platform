import type { Metadata } from 'next'
import Link from 'next/link'
import { MessagesSquare, Search, ShieldAlert } from 'lucide-react'
import type { Prisma } from '@prisma/client'
import { EmptyState } from '@/components/EmptyState'
import { requireContext } from '@/lib/context'
import { canMessage } from '@/lib/inbox'
import { prisma } from '@/lib/prisma'
import { NetIcon, RefreshButton, Thread, When } from './Thread'

export const metadata: Metadata = { title: 'Inbox — Loudpilot' }

export default async function InboxPage({ searchParams }: PageProps<'/app/inbox'>) {
  const { workspace, role, asAdmin } = await requireContext()
  const sp = await searchParams
  const accountId = typeof sp.a === 'string' ? sp.a : undefined
  const selectedId = typeof sp.c === 'string' ? sp.c : undefined
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''

  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId: workspace.id, network: { in: ['FACEBOOK', 'INSTAGRAM'] } },
    orderBy: [{ network: 'asc' }, { name: 'asc' }],
    include: { conversations: { select: { unread: true } } },
  })
  const allowed = accounts.filter(canMessage)
  const where: Prisma.ConversationWhereInput = {
    workspaceId: workspace.id,
    ...(accountId && { socialAccountId: accountId }),
    ...(q && { participantName: { contains: q, mode: 'insensitive' } }),
  }
  const [conversations, selected] = await Promise.all([
    prisma.conversation.findMany({ where, orderBy: { lastMessageAt: 'desc' }, take: 100, include: { socialAccount: { select: { name: true } } } }),
    selectedId
      ? prisma.conversation.findFirst({
          where: { id: selectedId, workspaceId: workspace.id },
          include: { socialAccount: true, messages: { orderBy: { sentAt: 'desc' }, take: 60 } },
        })
      : null,
  ])
  const link = (params: { a?: string; c?: string }) => {
    const u = new URLSearchParams()
    const a = 'a' in params ? params.a : accountId
    if (a) u.set('a', a)
    if (params.c) u.set('c', params.c)
    if (q) u.set('q', q)
    const s = u.toString()
    return `/app/inbox${s ? `?${s}` : ''}`
  }
  const canConnect = asAdmin || role !== 'EDITOR'

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="Connect a Facebook Page or Instagram"
        action={
          <Link href="/app/channels" className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">
            Connect channels
          </Link>
        }
      >
        Messages from Messenger and Instagram Direct land here, and you answer them without leaving Loudpilot.
      </EmptyState>
    )
  }

  return (
    <div className="-m-5 grid min-h-[calc(100vh-1.5rem)] sm:-m-8 lg:grid-cols-[230px_320px_1fr]">
      <h1 className="sr-only">Inbox</h1>
      <section className="border-b border-zinc-200 p-3 lg:border-r lg:border-b-0">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-sm font-semibold">Inbox</p>
          {allowed.length > 0 && <RefreshButton />}
        </div>
        <nav aria-label="Accounts" className="space-y-0.5">
          <Link
            href={link({ a: undefined })}
            className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-sm ${!accountId ? 'bg-zinc-100 font-medium' : 'hover:bg-zinc-50'}`}
          >
            All messages
            <Count n={accounts.reduce((s, a) => s + a.conversations.reduce((x, c) => x + c.unread, 0), 0)} />
          </Link>
          {accounts.map((a) => (
            <Link
              key={a.id}
              href={link({ a: a.id })}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${accountId === a.id ? 'bg-zinc-100 font-medium' : 'hover:bg-zinc-50'}`}
            >
              <NetIcon network={a.network} />
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              {canMessage(a) ? <Count n={a.conversations.reduce((x, c) => x + c.unread, 0)} /> : <ShieldAlert size={14} className="text-amber-600" aria-label="Messages not allowed" />}
            </Link>
          ))}
        </nav>
        {allowed.length < accounts.length && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
            <p className="font-semibold">Allow messages</p>
            <p className="mt-1">
              {allowed.length === 0 ? 'Your accounts were connected' : 'Some accounts were connected'} without permission to read and answer messages. Reconnect Meta and keep
              “Manage and access messages” switched on.
            </p>
            {canConnect && (
              <a href="/auth/meta" className="mt-2 inline-block rounded-lg bg-amber-900 px-3 py-1.5 font-semibold text-white">
                Reconnect Meta
              </a>
            )}
          </div>
        )}
        {allowed
          .filter((a) => a.inboxError && (!accountId || a.id === accountId))
          .map((a) => (
            <p key={a.id} className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {a.name}: {a.inboxError}
            </p>
          ))}
      </section>

      <section className="border-b border-zinc-200 lg:border-r lg:border-b-0">
        <form className="border-b border-zinc-200 p-3">
          {accountId && <input type="hidden" name="a" value={accountId} />}
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search people"
              aria-label="Search conversations"
              className="w-full rounded-lg border border-zinc-200 py-2 pr-3 pl-9 text-sm outline-none focus:border-zinc-400"
            />
          </div>
        </form>
        {conversations.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-zinc-500">
            {allowed.length === 0 ? 'Allow messages to see conversations here.' : q ? 'Nobody matches.' : 'No messages yet. New ones appear within 2 minutes.'}
          </p>
        ) : (
          <ul aria-label="Conversations" className="max-h-[calc(100vh-6rem)] divide-y divide-zinc-100 overflow-y-auto">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link href={link({ c: c.id })} className={`flex gap-3 px-3 py-3 ${c.id === selectedId ? 'bg-zinc-100' : 'hover:bg-zinc-50'}`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-700">
                    {c.participantName.replace(/^@/, '').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`min-w-0 flex-1 truncate text-sm ${c.unread ? 'font-semibold' : 'font-medium'}`}>{c.participantName}</span>
                      <span className="shrink-0 text-[11px] text-zinc-500">
                        <When iso={c.lastMessageAt.toISOString()} />
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <NetIcon network={c.network} size={11} />
                      <span className={`min-w-0 flex-1 truncate text-xs ${c.unread ? 'text-zinc-900' : 'text-zinc-500'}`}>
                        {c.lastFromMe && 'You: '}
                        {c.lastText}
                      </span>
                      {c.unread > 0 && <Count n={c.unread} />}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex min-h-[60vh] flex-col">
        {selected ? (
          <Thread
            key={selected.id}
            conversation={{
              id: selected.id,
              name: selected.participantName,
              network: selected.network,
              account: selected.socialAccount.name,
              unread: selected.unread,
              canReply: canMessage(selected.socialAccount) && selected.socialAccount.status === 'ACTIVE',
            }}
            messages={selected.messages.reverse().map((m) => ({
              id: m.id,
              fromMe: m.fromMe,
              text: m.text,
              at: m.sentAt.toISOString(),
              attachments: (m.attachments as { type: string; url: string }[] | null) ?? [],
            }))}
          />
        ) : (
          <EmptyState icon={MessagesSquare} title="Pick a conversation">
            Answer Messenger and Instagram messages here. Loudpilot can draft a reply from what it knows about your company.
          </EmptyState>
        )}
      </section>
    </div>
  )
}

function Count({ n }: { n: number }) {
  if (!n) return null
  return <span className="rounded-full bg-indigo-600 px-1.5 py-px text-[11px] font-semibold text-white">{n > 99 ? '99+' : n}</span>
}
