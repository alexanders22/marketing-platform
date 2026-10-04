'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowLeft, CalendarClock, ExternalLink, Heart, ImagePlus, LayoutTemplate, Loader2, MessageCircle, Pencil, Send, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { ChannelPicker, NETWORKS, type Network } from '@/components/channels'
import { useIsClient } from '@/components/LocalTime'
import { MediaPicker, type PickedMedia } from '@/components/MediaPicker'
import { designFromMedia } from '../studio/actions'
import { deletePost, generatePostImages, publishNow, savePost } from './actions'

export type PostDraft = {
  id?: string
  content: string
  hashtags: string[]
  media: PickedMedia[]
  channels: Network[]
  scheduledAt: string | null // ISO
  aiGenerated?: boolean
  campaign?: { id: string; name: string } | null
  status?: 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED'
}

export type Delivery = {
  id: string
  network: Network
  account: string
  status: 'PUBLISHED' | 'FAILED'
  permalink: string | null
  error: string | null
  metrics: Record<string, number> | null
}

const STATUS: Record<NonNullable<PostDraft['status']>, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-zinc-100 text-zinc-600' },
  SCHEDULED: { label: 'Scheduled', cls: 'bg-indigo-50 text-indigo-700' },
  PUBLISHING: { label: 'Publishing…', cls: 'bg-amber-50 text-amber-700' },
  PUBLISHED: { label: 'Published', cls: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Failed', cls: 'bg-red-50 text-red-700' },
}

const METRICS: [string, string][] = [
  ['reach', 'Reach'],
  ['views', 'Views'],
  ['likes', 'Likes'],
  ['comments', 'Comments'],
  ['shares', 'Shares'],
  ['saves', 'Saves'],
]

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
  connected = [],
  deliveries = [],
}: {
  initial: PostDraft
  brand: { name: string; logoUrl: string | null }
  // Networks with at least one active connected account.
  connected?: Network[]
  deliveries?: Delivery[]
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
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiCount, setAiCount] = useState(1)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const hashtags = tags
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#+/, ''))
    .filter((t) => /^[\p{L}\p{N}_]{1,60}$/u.test(t))
  const fullText = [content.trim(), hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n')
  const over = NETWORKS.filter((n) => channels.includes(n.id) && fullText.length > n.limit)

  const status = initial.status ?? 'DRAFT'
  const reachable = channels.filter((c) => connected.includes(c))
  const [notice, setNotice] = useState<string>()

  const persist = (schedule: boolean, allowEmpty = false) =>
    savePost({
        allowEmpty,
        id: initial.id,
        kind: 'SOCIAL',
        content,
        hashtags,
        mediaIds: media.map((m) => m.id),
        channels,
        scheduledAt: when ? new Date(when).toISOString() : null,
        aiGenerated: initial.aiGenerated,
        schedule,
      })

  const save = (schedule = false) =>
    start(async () => {
      setError(undefined)
      setNotice(undefined)
      const res = await persist(schedule)
      if (res.error) return setError(res.error)
      setSaved(true)
      if (!initial.id && res.id) router.replace(`/app/posts/${res.id}`)
      router.refresh()
    })

  const publish = () =>
    start(async () => {
      setError(undefined)
      setNotice(undefined)
      if (!confirm(`Publish now to ${reachable.map((r) => NETWORKS.find((n) => n.id === r)?.name).join(' and ')}?`)) return
      const res = status === 'PUBLISHED' ? { id: initial.id } : await persist(false)
      if ('error' in res && res.error) return setError(res.error)
      const out = await publishNow(res.id!)
      if (out.error) setError(out.error)
      else if (out.failed) setError(`Published to ${out.published}, failed on ${out.failed} — see below.`)
      else setNotice(`Published to ${out.published} account${out.published === 1 ? '' : 's'}.`)
      if (!initial.id && res.id) router.replace(`/app/posts/${res.id}`)
      router.refresh()
    })

  // Images can't change once the post is out.
  const editable = status !== 'PUBLISHED' && status !== 'PUBLISHING'

  // The Studio works on a saved post: save what is on screen first (a
  // scheduled post stays scheduled), then come back to it from the Studio.
  const saveForStudio = async () => {
    const res = await persist(status === 'SCHEDULED', true)
    if (res.error) {
      setError(res.error)
      return null
    }
    return res.id ?? initial.id ?? null
  }

  const designInStudio = () =>
    start(async () => {
      setError(undefined)
      const id = await saveForStudio()
      if (id) router.push(`/app/studio?post=${id}`)
    })

  const editInStudio = (m: PickedMedia) =>
    start(async () => {
      setError(undefined)
      const aspect = await new Promise<number>((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 1)
        img.onerror = () => resolve(1)
        img.src = m.url
      })
      const id = await saveForStudio()
      if (!id) return
      const res = await designFromMedia(m.id, aspect)
      if (res.error || !res.id) return setError(res.error ?? 'Could not open the Studio')
      router.push(`/app/studio/${res.id}?post=${id}&replace=${m.id}`)
    })

  const generate = async () => {
    setGenerating(true)
    setError(undefined)
    const res = await generatePostImages({ prompt: aiPrompt, caption: content, count: aiCount })
    setGenerating(false)
    if (res.error || !res.images) return setError(res.error)
    setMedia((cur) => [...cur, ...res.images!].slice(0, 10))
    setSaved(false)
    setAiOpen(false)
    setAiPrompt('')
    router.refresh()
  }

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
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {initial.id ? 'Edit post' : 'New post'}
            {initial.id && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[status].cls}`}>{STATUS[status].label}</span>
            )}
          </h1>
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
            <p className="mt-2 text-xs text-zinc-500">
              {reachable.length > 0
                ? `Publishes to your connected ${reachable.map((r) => NETWORKS.find((n) => n.id === r)?.name).join(' and ')} accounts.${
                    channels.length > reachable.length ? ' Other networks stay in the Planner until they are connected.' : ''
                  }`
                : 'Publishing starts once channels are connected — until then posts are planned drafts.'}
            </p>
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
            {media.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {media.map((m) => (
                  <span key={m.id} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt="" className="h-24 w-24 rounded-xl object-cover ring-1 ring-zinc-200" />
                    {editable && (
                      <button
                        onClick={() => editInStudio(m)}
                        disabled={pending}
                        className="absolute inset-x-1 bottom-1 inline-flex items-center justify-center gap-1 rounded-lg bg-white/90 py-1 text-[11px] font-semibold text-zinc-900 shadow-sm hover:bg-white"
                        aria-label="Edit image in Studio"
                      >
                        <Pencil size={11} /> Studio
                      </button>
                    )}
                    <button
                      onClick={() => (setMedia(media.filter((x) => x.id !== m.id)), setSaved(false))}
                      className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-zinc-900 text-white"
                      aria-label="Remove image"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {media.length < 10 && (
              <div className="grid gap-2 sm:grid-cols-3">
                <MediaOption icon={ImagePlus} title="Upload" sub="Your photos or library" label="Add images: upload or pick from the library" onClick={() => setPicker(true)} />
                {editable && <MediaOption icon={LayoutTemplate} title="Design in Studio" sub="Brand templates" onClick={designInStudio} disabled={pending} />}
                <MediaOption icon={Wand2} title="Generate with AI" sub="Edit it in Studio after" onClick={() => setAiOpen((v) => !v)} active={aiOpen} />
              </div>
            )}
            {aiOpen && (
              <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                <label className="text-sm font-medium" htmlFor="ai-image">
                  Describe the image
                </label>
                <textarea
                  id="ai-image"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={content.trim() ? 'Leave empty to draw from the post text' : 'e.g. Sunset view from a balcony of the new building'}
                  className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400"
                />
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-zinc-600">
                    Variants
                    <select value={aiCount} onChange={(e) => setAiCount(Number(e.target.value))} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm">
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={generate}
                    disabled={generating}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
                  >
                    {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                    {generating ? 'Drawing…' : `Generate · ${aiCount} credit${aiCount > 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}
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

          {reachable.length === 0 && (
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
              Planner only.{' '}
              <Link href="/app/channels" className="font-medium text-zinc-900 underline">
                Connect Facebook or Instagram
              </Link>{' '}
              to schedule and publish automatically.
            </p>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-5">
            {reachable.length > 0 && when && status !== 'PUBLISHED' && (
              <button
                onClick={() => save(true)}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                <CalendarClock size={15} /> {status === 'SCHEDULED' ? 'Update schedule' : 'Schedule'}
              </button>
            )}
            <button
              onClick={() => save(false)}
              disabled={pending}
              className={`rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60 ${
                reachable.length > 0 && when && status !== 'PUBLISHED'
                  ? 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
                  : 'bg-zinc-900 text-white hover:bg-zinc-800'
              }`}
            >
              {pending
                ? 'Saving…'
                : status === 'PUBLISHED'
                  ? 'Save'
                  : status === 'SCHEDULED'
                    ? 'Unschedule — keep as draft'
                    : when
                      ? 'Save to planner'
                      : 'Save draft'}
            </button>
            {reachable.length > 0 && (status !== 'PUBLISHED' || deliveries.some((d) => d.status === 'FAILED')) && (
              <button
                onClick={publish}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
              >
                <Send size={15} /> {status === 'PUBLISHED' ? 'Retry failed' : 'Publish now'}
              </button>
            )}
            {saved && <span className="text-sm text-emerald-600">Saved</span>}
            {initial.id && (
              <button onClick={remove} className="ml-auto inline-flex items-center gap-1.5 text-sm text-red-600 hover:underline">
                <Trash2 size={15} /> Delete
              </button>
            )}
          </div>
        </div>

        {deliveries.length > 0 && (
          <section className="lg:col-start-1">
            <p className="mb-2 text-sm font-semibold">Published to</p>
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
              {deliveries.map((d) => {
                const n = NETWORKS.find((x) => x.id === d.network)
                return (
                  <li key={d.id} className="p-3 text-sm">
                    <div className="flex items-center gap-2">
                      {n && <n.icon size={15} color={n.color} />}
                      <span className="min-w-0 flex-1 truncate font-medium">{d.account}</span>
                      {d.status === 'PUBLISHED' ? (
                        d.permalink ? (
                          <a href={d.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                            View <ExternalLink size={13} />
                          </a>
                        ) : (
                          <span className="text-emerald-600">Published</span>
                        )
                      ) : (
                        <span className="text-red-600">Failed</span>
                      )}
                    </div>
                    {d.error && <p className="mt-1 text-xs text-red-600">{d.error}</p>}
                    {d.metrics && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                        {METRICS.filter(([k]) => d.metrics![k] !== undefined).map(([k, label]) => (
                          <span key={k}>
                            {label} <b className="text-zinc-800">{d.metrics![k].toLocaleString('en-US')}</b>
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Preview */}
        <aside className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
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

function MediaOption({
  icon: Icon,
  title,
  sub,
  onClick,
  disabled,
  active,
  label,
}: {
  label?: string
  icon: typeof ImagePlus
  title: string
  sub: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={active}
      aria-label={label}
      className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition disabled:opacity-60 ${
        active ? 'border-violet-300 bg-violet-50' : 'border-dashed border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50'
      }`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-zinc-700 ring-1 ring-zinc-200">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-zinc-500">{sub}</span>
      </span>
    </button>
  )
}
