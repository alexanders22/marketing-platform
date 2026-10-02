'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowLeft, CalendarClock, Heart, ImagePlus, MessageCircle, Send, Sparkles, Trash2, X } from 'lucide-react'
import { ChannelPicker, NETWORKS, type Network } from '@/components/channels'
import { useIsClient } from '@/components/LocalTime'
import { MediaPicker, type PickedMedia } from '@/components/MediaPicker'
import { deletePost, savePost } from './actions'

export type PostDraft = {
  id?: string
  content: string
  hashtags: string[]
  media: PickedMedia[]
  channels: Network[]
  scheduledAt: string | null // ISO
  aiGenerated?: boolean
  campaign?: { id: string; name: string } | null
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function PostEditor({
  initial,
  brand,
  defaultWhen,
}: {
  initial: PostDraft
  brand: { name: string; logoUrl: string | null }
  // Local "YYYY-MM-DDTHH:mm" for a new post opened from a Planner day.
  defaultWhen?: string
}) {
  const router = useRouter()
  const [content, setContent] = useState(initial.content)
  const [tags, setTags] = useState(initial.hashtags.map((t) => `#${t}`).join(' '))
  const [media, setMedia] = useState(initial.media)
  // Defaults only for a brand-new post; a saved post keeps exactly its channels (even none).
  const [channels, setChannels] = useState<Network[]>(initial.id ? initial.channels : ['FACEBOOK', 'INSTAGRAM'])
  // The planned time is shown in the browser's zone, which the server can't
  // know — until hydration `edited` is null and nothing time-based renders.
  const isClient = useIsClient()
  const [edited, setWhen] = useState<string | null>(null)
  const when = edited ?? (isClient ? (initial.scheduledAt ? toLocalInput(initial.scheduledAt) : (defaultWhen ?? '')) : '')
  const [picker, setPicker] = useState(false)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const hashtags = tags
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#+/, ''))
    .filter((t) => /^[\p{L}\p{N}_]{1,60}$/u.test(t))
  const fullText = [content.trim(), hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n')
  const over = NETWORKS.filter((n) => channels.includes(n.id) && fullText.length > n.limit)

  const save = () =>
    start(async () => {
      setError(undefined)
      const res = await savePost({
        id: initial.id,
        kind: 'SOCIAL',
        content,
        hashtags,
        mediaIds: media.map((m) => m.id),
        channels,
        scheduledAt: when ? new Date(when).toISOString() : null,
        aiGenerated: initial.aiGenerated,
      })
      if (res.error) return setError(res.error)
      setSaved(true)
      if (!initial.id && res.id) router.replace(`/app/posts/${res.id}`)
      router.refresh()
    })

  const remove = () =>
    start(async () => {
      if (!initial.id || !confirm('Delete this post?')) return
      await deletePost(initial.id)
      router.push('/app/planner')
    })

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/app/planner" className="grid h-10 w-10 place-items-center rounded-lg bg-zinc-100 hover:bg-zinc-200" aria-label="Back">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">{initial.id ? 'Edit post' : 'New post'}</h1>
          {initial.campaign && (
            <Link href={`/app/campaigns/${initial.campaign.id}`} className="text-sm text-indigo-600 hover:underline">
              Part of {initial.campaign.name}
            </Link>
          )}
        </div>
        {initial.aiGenerated && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
            <Sparkles size={12} /> AI
          </span>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section>
            <p className="mb-2 text-sm font-semibold">Channels</p>
            <ChannelPicker value={channels} onChange={(v) => (setChannels(v), setSaved(false))} />
            <p className="mt-2 text-xs text-zinc-500">Publishing starts once channels are connected — until then posts are planned drafts.</p>
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold">Text</p>
            <textarea
              value={content}
              onChange={(e) => (setContent(e.target.value), setSaved(false))}
              placeholder="What do you want to share?"
              className="min-h-48 w-full resize-y rounded-xl border border-zinc-200 px-4 py-3 text-[15px] outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
            />
            <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-zinc-500">
              <span>{fullText.length.toLocaleString()} characters</span>
              {over.length > 0 && (
                <span className="text-red-600">
                  Too long for {over.map((n) => `${n.name} (${n.limit.toLocaleString()})`).join(', ')}
                </span>
              )}
            </div>
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold">Hashtags</p>
            <input
              value={tags}
              onChange={(e) => (setTags(e.target.value), setSaved(false))}
              placeholder="#brand #campaign"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
            />
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold">Images</p>
            <div className="flex flex-wrap gap-2">
              {media.map((m) => (
                <span key={m.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt="" className="h-24 w-24 rounded-xl object-cover ring-1 ring-zinc-200" />
                  <button
                    onClick={() => (setMedia(media.filter((x) => x.id !== m.id)), setSaved(false))}
                    className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-white"
                    aria-label="Remove image"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              {media.length < 10 && (
                <button
                  onClick={() => setPicker(true)}
                  className="grid h-24 w-24 place-items-center rounded-xl border-2 border-dashed border-zinc-200 text-zinc-500 hover:border-zinc-300"
                  aria-label="Add images"
                >
                  <ImagePlus size={20} />
                </button>
              )}
            </div>
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold">Planned for</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <CalendarClock size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => (setWhen(e.target.value), setSaved(false))}
                  className="rounded-lg border border-zinc-200 py-2 pr-3 pl-9 text-sm outline-none focus:border-zinc-400"
                />
              </div>
              {when && (
                <button onClick={() => (setWhen(''), setSaved(false))} className="text-sm text-zinc-500 hover:underline">
                  Clear — keep as draft
                </button>
              )}
            </div>
          </section>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex items-center gap-3 border-t border-zinc-100 pt-5">
            <button
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {pending ? 'Saving…' : when ? 'Save to planner' : 'Save draft'}
            </button>
            {saved && <span className="text-sm text-emerald-600">Saved</span>}
            {initial.id && (
              <button onClick={remove} className="ml-auto inline-flex items-center gap-1.5 text-sm text-red-600 hover:underline">
                <Trash2 size={15} /> Delete
              </button>
            )}
          </div>
        </div>

        {/* Preview */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-sm font-semibold">Preview</p>
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center gap-2.5 p-3">
              <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-zinc-100 ring-1 ring-zinc-200">
                {brand.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brand.logoUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-sm font-bold">{brand.name.slice(0, 1)}</span>
                )}
              </span>
              <div className="text-sm">
                <p className="font-semibold">{brand.name}</p>
                <p className="text-xs text-zinc-500">{when ? new Date(when).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Draft'}</p>
              </div>
            </div>
            {media[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media[0].url} alt="" className="aspect-square w-full object-cover" />
            )}
            <div className="flex gap-4 px-3 pt-3 text-zinc-700">
              <Heart size={20} /> <MessageCircle size={20} /> <Send size={20} />
            </div>
            <p className="px-3 py-3 text-sm whitespace-pre-wrap text-zinc-800">
              {content || <span className="text-zinc-400">Your text appears here…</span>}
              {hashtags.length > 0 && <span className="mt-2 block text-sky-700">{hashtags.map((h) => `#${h}`).join(' ')}</span>}
            </p>
          </div>
        </aside>
      </div>

      {picker && (
        <MediaPicker
          max={10 - media.length}
          onClose={() => setPicker(false)}
          onPick={(items) => (setMedia((m) => [...m, ...items.filter((i) => !m.some((x) => x.id === i.id))]), setSaved(false))}
        />
      )}
    </div>
  )
}
