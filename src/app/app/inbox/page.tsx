import type { Metadata } from 'next'
import Link from 'next/link'
import { AtSign, Check, Inbox, MessageCircle, MessageSquare, MessagesSquare, Search } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'

export const metadata: Metadata = { title: 'Inbox — Khma' }

export default function InboxPage() {
  return (
    <div className="-m-5 grid min-h-[calc(100vh-1.5rem)] sm:-m-8 lg:grid-cols-[280px_340px_1fr]">
      <section className="border-b border-zinc-200 p-4 lg:border-r lg:border-b-0">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
          <input
            placeholder="Search profiles"
            className="w-full rounded-lg border border-zinc-200 py-2 pr-3 pl-9 text-sm outline-none focus:border-zinc-400"
          />
        </div>
        <EmptyState
          icon={MessagesSquare}
          title="No profiles found"
          action={
            <Link href="/app/channels" className="rounded-lg bg-zinc-100 px-8 py-2.5 text-sm font-semibold hover:bg-zinc-200">
              Connect
            </Link>
          }
        >
          Connect the social profiles whose conversations you want to manage here.
        </EmptyState>
      </section>

      <section className="border-b border-zinc-200 lg:border-r lg:border-b-0">
        <div className="flex gap-1 border-b border-zinc-200 px-3 text-sm">
          {[
            { l: 'DMs', i: MessageCircle, on: true },
            { l: 'Mentions', i: AtSign },
            { l: 'Comments', i: MessageSquare },
          ].map((t) => (
            <span
              key={t.l}
              className={`inline-flex items-center gap-1.5 px-3 py-3 font-medium ${
                t.on ? 'border-b-2 border-red-500 text-zinc-900' : 'text-zinc-600'
              }`}
            >
              <t.i size={15} /> {t.l}
            </span>
          ))}
        </div>
        <div className="flex gap-2 border-b border-zinc-200 p-3 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-1 text-white">
            <Check size={13} /> Open
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">Resolved</span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">Assigned to me</span>
        </div>
        <EmptyState icon={MessageCircle} title="No messages yet">
          Direct messages from your connected profiles will appear here.
        </EmptyState>
      </section>

      <section className="hidden bg-zinc-50/60 lg:block">
        <EmptyState icon={Inbox} title="No thread selected">
          Select a conversation to read and reply. Khma will suggest on-brand answers.
        </EmptyState>
      </section>
    </div>
  )
}
