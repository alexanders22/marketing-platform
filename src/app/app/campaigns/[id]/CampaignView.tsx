'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { ArrowLeft, CalendarRange, FileText, ImagePlus, Loader2, Pencil, RefreshCw, Sparkles, Target, Trash2 } from 'lucide-react'
import { ChannelIcons } from '@/components/channels'
import { LocalTime } from '@/components/LocalTime'
import { writeArticle } from '../../blog/actions'
import { addCampaignImages, deleteCampaign, regenerateCampaignPost } from '../actions'
import { CampaignImagesModal, type ImagesChoice } from '../CampaignImages'
import { creditsLabel } from '@/lib/pricing'
import { usePrices } from '@/components/Prices'

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

// Rendered in the viewer's time zone after hydration (see LocalTime).
const day = (iso: string) => <LocalTime iso={iso} options={{ weekday: 'short', day: 'numeric', month: 'short' }} />
const time = (iso: string) => <LocalTime iso={iso} options={{ hour: '2-digit', minute: '2-digit' }} />

export type ImageProgress = { generating: boolean; done: number; total: number }

export function CampaignView({
  campaign: c,
  posts,
  images,
  imagesError,
}: {
  campaign: Campaign
  posts: Item[]
  images: ImageProgress
  imagesError?: string
}) {
  const P = usePrices()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string>()
  const [, start] = useTransition()
  const isBlog = c.kind === 'BLOG'
  const written = posts.filter((p) => p.content.trim()).length
  const bare = posts.filter((p) => !p.image).length
  const [pics, setPics] = useState(false)
  const [picsError, setPicsError] = useState<string | undefined>(imagesError)
  const [picsBusy, startPics] = useTransition()

  // AI pictures arrive in the background: refresh until they are all in.
  useEffect(() => {
    if (!images.generating) return
    const t = setInterval(() => router.refresh(), 4000)
    return () => clearInterval(t)
  }, [images.generating, router])

  const addPictures = (choice: ImagesChoice) =>
    startPics(async () => {
      if (!choice) return setPics(false)
      setPicsError(undefined)
      const res = await addCampaignImages(c.id, choice)
      if (res.error) return setPicsError(res.error)
      setPics(false)
      router.refresh()
    })

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

      {!isBlog && images.generating && (
        <div className="mb-6 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900 ring-1 ring-indigo-200" role="status">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 size={15} className="animate-spin" /> Making pictures for the posts · {images.done} of {images.total}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${images.total ? (images.done / images.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      {!isBlog && !images.generating && bare > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-zinc-300 p-4 text-sm">
          <ImagePlus size={18} className="text-zinc-500" />
          <span className="mr-auto">
            {bare} post{bare === 1 ? '' : 's'} without a picture.
            {picsError && !pics && <span className="ml-2 text-red-600">{picsError}</span>}
          </span>
          <button onClick={() => setPics(true)} className="rounded-lg bg-zinc-900 px-3 py-1.5 font-semibold text-white hover:bg-zinc-800">
            Add pictures
          </button>
        </div>
      )}
      {pics && (
        <CampaignImagesModal
          posts={bare}
          confirm="Add pictures"
          busy={picsBusy}
          error={picsError}
          allowNone={false}
          onConfirm={addPictures}
          onClose={() => setPics(false)}
        />
      )}
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
                      title={`Rewrite with a new angle · ${creditsLabel(P.campaignPost)}`}
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
                      {busy === p.id ? 'Writing…' : `Write article · ${creditsLabel(P.blogArticle)}`}
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
