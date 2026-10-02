'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft, CalendarClock, Check, Copy, ImagePlus, Loader2, Sparkles, Trash2, X } from 'lucide-react'
import { MediaPicker, type PickedMedia } from '@/components/MediaPicker'
import { deletePost, savePost } from '../posts/actions'
import { writeArticle } from './actions'

export type BlogDraft = {
  id?: string
  title: string
  content: string
  outline: string | null
  keywords: string[]
  cover: PickedMedia | null
  scheduledAt: string | null
  aiGenerated?: boolean
  campaign?: { id: string; name: string } | null
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function BlogEditor({ initial }: { initial: BlogDraft }) {
  const router = useRouter()
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.content)
  const [keywords, setKeywords] = useState(initial.keywords.join(', '))
  const [cover, setCover] = useState(initial.cover)
  const [when, setWhen] = useState(toLocalInput(initial.scheduledAt))
  const [tab, setTab] = useState<'write' | 'preview'>(initial.content ? 'preview' : 'write')
  const [picker, setPicker] = useState(false)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()
  const [writing, startWrite] = useTransition()

  const words = body.trim() ? body.trim().split(/\s+/).length : 0

  const save = () =>
    start(async () => {
      setError(undefined)
      const res = await savePost({
        id: initial.id,
        kind: 'BLOG',
        title,
        content: body,
        hashtags: keywords
          .split(',')
          .map((k) => k.trim().replace(/[^\p{L}\p{N}_]/gu, ''))
          .filter(Boolean),
        mediaIds: cover ? [cover.id] : [],
        channels: [],
        scheduledAt: when ? new Date(when).toISOString() : null,
        aiGenerated: initial.aiGenerated,
      })
      if (res.error) return setError(res.error)
      setSaved(true)
      if (!initial.id && res.id) router.replace(`/app/blog/${res.id}`)
      router.refresh()
    })

  const write = () =>
    startWrite(async () => {
      if (!initial.id) return
      setError(undefined)
      const res = await writeArticle(initial.id)
      if (res.error) setError(res.error)
      else router.refresh()
    })

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/app/planner?view=list" className="grid h-10 w-10 place-items-center rounded-lg bg-zinc-100 hover:bg-zinc-200" aria-label="Back">
          <ArrowLeft size={18} />
        </Link>
        <div className="mr-auto">
          <h1 className="text-xl font-semibold">{initial.id ? 'Edit article' : 'New article'}</h1>
          {initial.campaign && (
            <Link href={`/app/campaigns/${initial.campaign.id}`} className="text-sm text-indigo-600 hover:underline">
              Part of {initial.campaign.name}
            </Link>
          )}
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(`# ${title}\n\n${body}`)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} Copy Markdown
        </button>
      </div>

      {/* Cover */}
      {cover ? (
        <div className="relative mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover.url} alt="" className="aspect-[2/1] w-full rounded-2xl object-cover" />
          <button
            onClick={() => setCover(null)}
            className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow"
            aria-label="Remove cover"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPicker(true)}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 py-8 text-sm text-zinc-500 hover:border-zinc-300"
        >
          <ImagePlus size={18} /> Add cover image
        </button>
      )}

      <input
        value={title}
        onChange={(e) => (setTitle(e.target.value), setSaved(false))}
        placeholder="Article title"
        className="w-full text-3xl font-semibold outline-none placeholder:text-zinc-300"
      />

      {initial.outline && !body && (
        <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
          <p className="text-sm font-semibold text-indigo-900">Outline</p>
          <p className="mt-1 text-sm whitespace-pre-wrap text-indigo-900/80">{initial.outline}</p>
          <button
            onClick={write}
            disabled={writing}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {writing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {writing ? 'Writing… up to a minute' : 'Write this article with AI · 3 credits'}
          </button>
        </div>
      )}

      <div className="mt-5 flex items-center gap-1 border-b border-zinc-200 text-sm">
        {(['write', 'preview'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 font-medium capitalize ${tab === t ? 'border-zinc-900' : 'border-transparent text-zinc-500'}`}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-500">{words.toLocaleString()} words</span>
      </div>
      {tab === 'write' ? (
        <textarea
          value={body}
          onChange={(e) => (setBody(e.target.value), setSaved(false))}
          placeholder={'Write in Markdown — ## for headings, - for lists, **bold**.'}
          className="mt-3 min-h-[420px] w-full resize-y rounded-xl border border-zinc-200 p-4 font-mono text-sm leading-relaxed outline-none focus:border-zinc-400"
        />
      ) : (
        <article className="prose-khma mt-4 min-h-[200px]">
          {body ? <ReactMarkdown>{body}</ReactMarkdown> : <p className="text-zinc-400">Nothing written yet.</p>}
        </article>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold">Keywords</span>
          <input
            value={keywords}
            onChange={(e) => (setKeywords(e.target.value), setSaved(false))}
            placeholder="seo, keywords, comma separated"
            className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Planned for</span>
          <div className="relative mt-1.5">
            <CalendarClock size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => (setWhen(e.target.value), setSaved(false))}
              className="w-full rounded-lg border border-zinc-200 py-2.5 pr-3 pl-9 text-sm outline-none focus:border-zinc-400"
            />
          </div>
        </label>
      </div>

      {error && <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex items-center gap-3 border-t border-zinc-100 pt-5">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save article'}
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved</span>}
        {initial.id && (
          <button
            onClick={() =>
              start(async () => {
                if (!confirm('Delete this article?')) return
                await deletePost(initial.id!)
                router.push('/app/planner?view=list')
              })
            }
            className="ml-auto inline-flex items-center gap-1.5 text-sm text-red-600 hover:underline"
          >
            <Trash2 size={15} /> Delete
          </button>
        )}
      </div>

      {picker && <MediaPicker max={1} onClose={() => setPicker(false)} onPick={(items) => setCover(items[0] ?? null)} />}
    </div>
  )
}
