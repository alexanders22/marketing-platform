'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowLeft, CalendarRange, FileText, Loader2, Pencil, RefreshCw, Sparkles, Target, Trash2 } from 'lucide-react'
import { ChannelIcons } from '@/components/channels'
import { writeArticle } from '../../blog/actions'
import { deleteCampaign, regenerateCampaignPost } from '../actions'

type Campaign = { id: string; kind: 'SOCIAL' | 'BLOG'; name: string; brief: string; startsOn: string; endsOn: string; tone: string; language: string }
type Item = {
  id: string
  title: string | null
  content: string
  outline: string | null
  hashtags: string[]
  channels: string[]
  image: string | null
  scheduledAt: string | null
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

export function CampaignView({ campaign: c, posts }: { campaign: Campaign; posts: Item[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string>()
  const [, start] = useTransition()
  const isBlog = c.kind === 'BLOG'
  const written = posts.filter((p) => p.content.trim()).length

  const run = (id: string, fn: () => Promise<{ error?: string }>) => {
    setBusy(id)
    setError(undefined)
    start(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      setBusy(null)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <Link href="/app/campaigns" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-100 hover:bg-zinc-200" aria-label="Back">
          <ArrowLeft size={18} />
        </Link>
        <div className="mr-auto min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
            {isBlog ? <FileText size={13} /> : <Target size={13} />} {isBlog ? 'Blog series' : 'Social campaign'}
          </p>
          <h1 className="text-2xl font-semibold">{c.name}</h1>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-zinc-500">
            <CalendarRange size={15} /> {day(c.startsOn)} – {day(c.endsOn)} · {posts.length} {isBlog ? `articles (${written} written)` : 'posts'} · {c.tone} · {c.language}
          </p>
        </div>
        <button
          onClick={() => {
            if (!confirm(`Delete "${c.name}" and all its ${isBlog ? 'articles' : 'posts'}?`)) return
            run('delete', async () => {
              const res = await deleteCampaign(c.id, true)
              if (!res.error) router.push('/app/campaigns')
              return res
            })
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
        >
          <Trash2 size={15} /> Delete
        </button>
      </div>

      <p className="mb-6 rounded-xl bg-zinc-50 p-4 text-sm whitespace-pre-wrap text-zinc-700">{c.brief}</p>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <ol className="relative space-y-4 border-l-2 border-zinc-100 pl-6">
        {posts.map((p, i) => (
          <li key={p.id} className="relative">
            <span className="absolute top-5 -left-[31px] grid h-4 w-4 place-items-center rounded-full bg-white ring-2 ring-zinc-300" />
            <div className="rounded-xl border border-zinc-200 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{p.scheduledAt ? day(p.scheduledAt) : 'Unscheduled'}</span>
                {p.scheduledAt && <span className="text-zinc-500">{time(p.scheduledAt)}</span>}
                <span className="text-zinc-300">·</span>
                <span className="text-zinc-500">#{i + 1}</span>
                {!isBlog && <ChannelIcons value={p.channels} />}
                <div className="ml-auto flex gap-1">
                  {!isBlog && (
                    <button
                      onClick={() => run(p.id, () => regenerateCampaignPost(p.id))}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                      title="Rewrite with a new angle · 1 credit"
                    >
                      {busy === p.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Rewrite
                    </button>
                  )}
                  <Link
                    href={isBlog ? `/app/blog/${p.id}` : `/app/posts/${p.id}`}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                  >
                    <Pencil size={13} /> Edit
                  </Link>
                </div>
              </div>
              {p.title && <p className="mt-2 font-semibold">{p.title}</p>}
              {isBlog ? (
                p.content.trim() ? (
                  <p className="mt-1 line-clamp-3 text-sm text-zinc-600">{p.content.replace(/[#*_>`-]/g, '').slice(0, 400)}</p>
                ) : (
                  <>
                    {p.outline && <p className="mt-1 text-sm text-zinc-600">{p.outline}</p>}
                    <button
                      onClick={() => run(p.id, () => writeArticle(p.id))}
                      disabled={busy !== null}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {busy === p.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {busy === p.id ? 'Writing…' : 'Write article · 3 credits'}
                    </button>
                  </>
                )
              ) : (
                <div className="mt-2 flex gap-4">
                  {p.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="line-clamp-4 text-sm whitespace-pre-wrap text-zinc-700">{p.content}</p>
                    {p.hashtags.length > 0 && <p className="mt-1.5 truncate text-sm text-sky-700">{p.hashtags.map((h) => `#${h}`).join(' ')}</p>}
                  </div>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
