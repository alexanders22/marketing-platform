'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, FileText, List, PartyPopper, Plus, Sparkles, Target } from 'lucide-react'
import { holidaysBetween, type Holiday } from '@/lib/holidays'
import { ChannelIcons } from '@/components/channels'
import { LocalTime, useIsClient } from '@/components/LocalTime'

export type PlannerPost = {
  id: string
  kind: 'SOCIAL' | 'BLOG'
  title: string | null
  text: string
  channels: string[]
  image: string | null
  scheduledAt: string | null
  campaignId: string | null
  hasBody: boolean
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED'
}

// Drafts carry no dot: they only sit in the Planner.
const DOT: Partial<Record<PlannerPost['status'], { cls: string; label: string }>> = {
  SCHEDULED: { cls: 'bg-indigo-500', label: 'Scheduled' },
  PUBLISHING: { cls: 'bg-amber-500', label: 'Publishing' },
  PUBLISHED: { cls: 'bg-emerald-500', label: 'Published' },
  FAILED: { cls: 'bg-red-500', label: 'Failed' },
}

function StatusDot({ status }: { status: PlannerPost['status'] }) {
  const d = DOT[status]
  return d ? <span title={d.label} aria-label={d.label} className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.cls}`} /> : null
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const href = (p: PlannerPost) => (p.kind === 'BLOG' ? `/app/blog/${p.id}` : `/app/posts/${p.id}`)

export function Planner({ view, month, posts, now }: { view: 'calendar' | 'list'; month: string; posts: PlannerPost[]; now: number }) {
  const [y, m] = month.split('-').map(Number)
  const [kind, setKind] = useState<'ALL' | 'SOCIAL' | 'BLOG'>('ALL')
  const shown = posts.filter((p) => kind === 'ALL' || p.kind === kind)
  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1)
    return `/app/planner?m=${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  }
  const today = new Date()
  const thisMonth = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {view === 'calendar' ? (
          <>
            <h1 className="mr-2 text-xl font-semibold">
              {new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
            </h1>
            <div className="flex items-center gap-1">
              <Link href={shift(-1)} className="rounded-lg p-1.5 hover:bg-zinc-100" aria-label="Previous month">
                <ChevronLeft size={18} />
              </Link>
              <Link href={`/app/planner?m=${thisMonth}`} className="rounded-lg border border-zinc-200 px-3 py-1 text-sm font-medium hover:bg-zinc-50">
                Today
              </Link>
              <Link href={shift(1)} className="rounded-lg p-1.5 hover:bg-zinc-100" aria-label="Next month">
                <ChevronRight size={18} />
              </Link>
            </div>
          </>
        ) : (
          <h1 className="mr-2 text-xl font-semibold">All content</h1>
        )}

        <div className="flex rounded-lg bg-zinc-100 p-0.5 text-sm">
          {(['ALL', 'SOCIAL', 'BLOG'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md px-2.5 py-1 font-medium ${kind === k ? 'bg-white shadow-sm' : 'text-zinc-500'}`}
            >
              {k === 'ALL' ? 'All' : k === 'SOCIAL' ? 'Social' : 'Blog'}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg bg-zinc-100 p-0.5">
            <Link
              href={`/app/planner?m=${month}`}
              className={`rounded-md p-1.5 ${view === 'calendar' ? 'bg-white shadow-sm' : 'text-zinc-500'}`}
              aria-label="Calendar view"
            >
              <CalendarDays size={16} />
            </Link>
            <Link
              href={`/app/planner?view=list&m=${month}`}
              className={`rounded-md p-1.5 ${view === 'list' ? 'bg-white shadow-sm' : 'text-zinc-500'}`}
              aria-label="List view"
            >
              <List size={16} />
            </Link>
          </div>
          <Link href="/app/posts/new" className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
            <Plus size={16} /> Create post
          </Link>
        </div>
      </div>

      {view === 'calendar' ? <Month y={y} m={m} posts={shown} /> : <ListView posts={shown} now={now} />}
    </div>
  )
}

// Days and times depend on the viewer's time zone, so posts and "today" are
// placed only after hydration; the server renders the empty grid.
function Month({ y, m, posts }: { y: number; m: number; posts: PlannerPost[] }) {
  const isClient = useIsClient()
  const today = isClient ? localDay(new Date()) : ''
  const cells = useMemo(() => {
    const first = new Date(y, m - 1, 1)
    const start = new Date(first)
    start.setDate(1 - ((first.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [y, m])

  const byDay = useMemo(() => {
    const map = new Map<string, PlannerPost[]>()
    if (!isClient) return map
    for (const p of posts) {
      if (!p.scheduledAt) continue
      const k = localDay(new Date(p.scheduledAt))
      map.set(k, [...(map.get(k) ?? []), p])
    }
    return map
  }, [posts, isClient])
  // Holidays and marketing moments on the visible days.
  const holidays = useMemo(() => {
    const map = new Map<string, Holiday[]>()
    for (const h of holidaysBetween(localDay(cells[0]), localDay(cells[cells.length - 1]))) map.set(h.date, [...(map.get(h.date) ?? []), h])
    return map
  }, [cells])

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-xl border border-zinc-200">
        {DAYS.map((d) => (
          <div key={d} className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-500">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          const key = localDay(d)
          const inMonth = d.getMonth() === m - 1
          const items = byDay.get(key) ?? []
          return (
            <div
              key={i}
              className={`group relative min-h-32 border-zinc-200 p-1.5 ${i % 7 !== 6 ? 'border-r' : ''} ${i < 35 ? 'border-b' : ''} ${
                inMonth ? '' : 'bg-zinc-50/60'
              }`}
            >
              <div className="flex items-center justify-between px-0.5">
                <span
                  className={`inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs ${
                    key === today ? 'bg-zinc-900 font-semibold text-white' : inMonth ? 'text-zinc-700' : 'text-zinc-400'
                  }`}
                >
                  {d.getDate()}
                </span>
                <Link
                  href={`/app/posts/new?date=${key}`}
                  className="rounded p-0.5 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-100 hover:text-zinc-700"
                  aria-label={`New post on ${key}`}
                >
                  <Plus size={15} />
                </Link>
              </div>
              {(holidays.get(key) ?? []).map((h) => (
                <Link
                  key={h.name}
                  href={`/app/create?prompt=${encodeURIComponent(`A post for ${h.name} (${h.date}). ${h.idea}`)}`}
                  title={`${h.name} — ${h.idea} Click to write a post.`}
                  className={`mt-1 flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                    h.kind === 'public' ? 'bg-rose-50 text-rose-800' : 'bg-violet-50 text-violet-800'
                  }`}
                >
                  <PartyPopper size={11} className="shrink-0" /> <span className="truncate">{h.name}</span>
                </Link>
              ))}
              <div className="mt-1 space-y-1">
                {items.slice(0, 4).map((p) => (
                  <Link
                    key={p.id}
                    href={href(p)}
                    className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] leading-tight transition hover:brightness-95 ${
                      p.kind === 'BLOG' ? 'bg-orange-50 text-orange-900' : 'bg-sky-50 text-sky-900'
                    }`}
                  >
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />
                    ) : p.kind === 'BLOG' ? (
                      <FileText size={12} className="shrink-0" />
                    ) : null}
                    <StatusDot status={p.status} />
                    <span className="shrink-0 font-semibold">
                      {new Date(p.scheduledAt!).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="truncate">{p.title || p.text || 'Untitled'}</span>
                  </Link>
                ))}
                {items.length > 4 && <p className="px-1 text-[11px] text-zinc-500">+{items.length - 4} more</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ListView({ posts, now }: { posts: PlannerPost[]; now: number }) {
  const upcoming = posts.filter((p) => p.scheduledAt && new Date(p.scheduledAt).getTime() >= now)
  const drafts = posts.filter((p) => !p.scheduledAt)
  const past = posts.filter((p) => p.scheduledAt && new Date(p.scheduledAt).getTime() < now).reverse()

  if (posts.length === 0)
    return (
      <div className="rounded-xl border border-zinc-200 py-16 text-center text-sm text-zinc-500">
        Nothing here yet. Create a post, an AI post or a campaign.
      </div>
    )

  return (
    <div className="space-y-8">
      <Group title="Upcoming" posts={upcoming} />
      <Group title="Drafts" posts={drafts} />
      <Group title="Past" posts={past} />
    </div>
  )
}

function Group({ title, posts }: { title: string; posts: PlannerPost[] }) {
  if (posts.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-zinc-500">
        {title} · {posts.length}
      </h2>
      <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
        {posts.map((p) => (
          <li key={p.id}>
            <Link href={href(p)} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
              <span className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg ${p.kind === 'BLOG' ? 'bg-orange-50 text-orange-600' : 'bg-sky-50 text-sky-600'}`}>
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="h-full w-full object-cover" />
                ) : p.kind === 'BLOG' ? (
                  <FileText size={17} />
                ) : (
                  <Sparkles size={17} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.title || p.text || 'Untitled'}</p>
                <p className="truncate text-xs text-zinc-500">
                  {p.kind === 'BLOG' ? (p.hasBody ? 'Article' : 'Article outline — not written yet') : p.text}
                </p>
              </div>
              {p.campaignId && <Target size={15} className="shrink-0 text-indigo-500" aria-label="Part of a campaign" />}
              <ChannelIcons value={p.channels} />
              {DOT[p.status] ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-zinc-500">
                  <StatusDot status={p.status} /> {DOT[p.status]!.label}
                </span>
              ) : null}
              <span className="w-32 shrink-0 text-right text-xs text-zinc-500">
                {p.scheduledAt ? <LocalTime iso={p.scheduledAt} options={{ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }} /> : 'Draft'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
