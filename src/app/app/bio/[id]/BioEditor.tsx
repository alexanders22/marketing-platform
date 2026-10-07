'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Heading,
  ImagePlus,
  Link2,
  MousePointerClick,
  Plus,
  Share2,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import { BioView } from '@/components/BioView'
import { MediaPicker, type PickedMedia } from '@/components/MediaPicker'
import { bioUid, type BioBlock, type BioTheme } from '@/lib/bio'
import { deleteBioPage, saveBioPage } from '../actions'
import { confirmDialog } from '@/components/ui/Dialog'

type Initial = {
  id: string
  slug: string
  title: string
  bio: string
  avatar: PickedMedia | null
  theme: BioTheme
  blocks: BioBlock[]
  published: boolean
}

const input = 'w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100'

export function BioEditor({
  initial,
  presets,
  stats,
}: {
  initial: Initial
  presets: { name: string; theme: BioTheme }[]
  stats: { views: number; clicks: Record<string, number> }
}) {
  const router = useRouter()
  const [slug, setSlug] = useState(initial.slug)
  const [title, setTitle] = useState(initial.title)
  const [bio, setBio] = useState(initial.bio)
  const [avatar, setAvatar] = useState(initial.avatar)
  const [theme, setTheme] = useState(initial.theme)
  const [blocks, setBlocks] = useState(initial.blocks)
  const [published, setPublished] = useState(initial.published)
  const [savedSlug, setSavedSlug] = useState(initial.slug)
  const [picker, setPicker] = useState(false)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  const publicUrl = typeof window === 'undefined' ? `/b/${savedSlug}` : `${window.location.origin}/b/${savedSlug}`
  const totalClicks = Object.values(stats.clicks).reduce((a, b) => a + b, 0)

  const update = (id: string, p: Partial<BioBlock>) => setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...p } as BioBlock) : b)))
  const move = (i: number, d: -1 | 1) =>
    setBlocks((bs) => {
      const j = i + d
      if (j < 0 || j >= bs.length) return bs
      const n = [...bs]
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
  const add = (type: BioBlock['type']) => {
    const id = bioUid()
    const b: BioBlock =
      type === 'link'
        ? { id, type, title: 'New link', url: 'https://', enabled: true }
        : type === 'heading'
          ? { id, type, text: 'Section title', enabled: true }
          : type === 'text'
            ? { id, type, text: 'A short note for your visitors.', enabled: true }
            : { id, type, links: [], enabled: true }
    setBlocks((bs) => [...bs, b])
  }

  const save = (publish = published) =>
    start(async () => {
      setError(undefined)
      setSaved(false)
      const res = await saveBioPage({
        id: initial.id,
        slug,
        title,
        bio,
        avatarMediaId: avatar?.id ?? null,
        theme,
        blocks,
        published: publish,
      })
      if (res.error) return setError(res.error)
      setPublished(publish)
      setSavedSlug(slug.trim().toLowerCase())
      setSaved(true)
      router.refresh()
    })

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/app/bio" className="grid h-10 w-10 place-items-center rounded-lg bg-zinc-100 hover:bg-zinc-200" aria-label="Back">
          <ArrowLeft size={18} />
        </Link>
        <div className="mr-auto">
          <h1 className="text-xl font-semibold">{title || 'Bio page'}</h1>
          <p className="flex gap-3 text-sm text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <Eye size={14} /> {stats.views.toLocaleString()} views
            </span>
            <span className="inline-flex items-center gap-1">
              <MousePointerClick size={14} /> {totalClicks.toLocaleString()} clicks
            </span>
          </p>
        </div>
        {published && (
          <>
            <button
              onClick={() => {
                navigator.clipboard.writeText(publicUrl)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} Copy link
            </button>
            <a href={`/b/${savedSlug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50">
              <ExternalLink size={14} /> Open
            </a>
          </>
        )}
        <button
          onClick={() => save(!published)}
          disabled={pending}
          className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${published ? 'border border-zinc-200 hover:bg-zinc-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
        >
          {published ? 'Unpublish' : 'Publish'}
        </button>
        <button
          onClick={() => save()}
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && !error && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved{published ? ' — your page is live.' : '.'}</p>}

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          {/* Profile */}
          <section className="space-y-4">
            <h2 className="font-semibold">Profile</h2>
            <div className="flex items-center gap-4">
              <button onClick={() => setPicker(true)} className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-zinc-100 ring-1 ring-zinc-200" aria-label="Change avatar">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus size={20} className="text-zinc-400" />
                )}
              </button>
              <div className="flex gap-2 text-sm">
                <button onClick={() => setPicker(true)} className="rounded-lg border border-zinc-200 px-3 py-1.5 hover:bg-zinc-50">
                  {avatar ? 'Change' : 'Add avatar'}
                </button>
                {avatar && (
                  <button onClick={() => setAvatar(null)} className="rounded-lg px-3 py-1.5 text-red-600 hover:bg-red-50">
                    Remove
                  </button>
                )}
              </div>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Title</span>
              <input className={`${input} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Bio</span>
              <textarea className={`${input} mt-1 min-h-20 resize-y`} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Page address</span>
              <div className="mt-1 flex items-center overflow-hidden rounded-lg border border-zinc-200 focus-within:border-zinc-400">
                <span className="bg-zinc-50 px-3 py-2 text-sm text-zinc-500">/b/</span>
                <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} className="w-full px-2 py-2 text-sm outline-none" />
              </div>
            </label>
          </section>

          {/* Blocks */}
          <section>
            <h2 className="mb-3 font-semibold">Links & blocks</h2>
            <div className="space-y-3">
              {blocks.map((b, i) => (
                <div key={b.id} className={`rounded-xl border p-3 ${b.enabled ? 'border-zinc-200' : 'border-dashed border-zinc-200 opacity-60'}`}>
                  <div className="mb-2 flex items-center gap-1 text-xs text-zinc-500">
                    {b.type === 'link' ? <Link2 size={14} /> : b.type === 'heading' ? <Heading size={14} /> : b.type === 'text' ? <Type size={14} /> : <Share2 size={14} />}
                    <span className="mr-auto font-medium capitalize">{b.type === 'socials' ? 'Social icons' : b.type}</span>
                    {b.type === 'link' && <span className="mr-2">{(stats.clicks[b.id] ?? 0).toLocaleString()} clicks</span>}
                    <Mini label="Move up" onClick={() => move(i, -1)}><ArrowUp size={14} /></Mini>
                    <Mini label="Move down" onClick={() => move(i, 1)}><ArrowDown size={14} /></Mini>
                    <Mini label={b.enabled ? 'Hide' : 'Show'} onClick={() => update(b.id, { enabled: !b.enabled })}>
                      {b.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                    </Mini>
                    <Mini label="Delete" onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))}>
                      <Trash2 size={14} className="text-red-600" />
                    </Mini>
                  </div>
                  {b.type === 'link' && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input className={input} aria-label="Link text" value={b.title} onChange={(e) => update(b.id, { title: e.target.value })} placeholder="Button text" maxLength={80} />
                      <input className={input} aria-label="Link URL" value={b.url} onChange={(e) => update(b.id, { url: e.target.value })} placeholder="https://" />
                    </div>
                  )}
                  {(b.type === 'heading' || b.type === 'text') && (
                    <textarea
                      className={`${input} ${b.type === 'heading' ? 'min-h-0' : 'min-h-16'} resize-y`}
                      rows={b.type === 'heading' ? 1 : 2}
                      value={b.text}
                      onChange={(e) => update(b.id, { text: e.target.value })}
                    />
                  )}
                  {b.type === 'socials' && (
                    <div className="space-y-2">
                      {b.links.map((l, j) => (
                        <div key={j} className="flex gap-2">
                          <input
                            className={input}
                            aria-label="Social profile URL"
                            value={l}
                            onChange={(e) => update(b.id, { links: b.links.map((x, k) => (k === j ? e.target.value : x)) })}
                            placeholder="https://instagram.com/yourbrand"
                          />
                          <button onClick={() => update(b.id, { links: b.links.filter((_, k) => k !== j) })} className="rounded-lg px-2 text-zinc-500 hover:bg-zinc-100" aria-label="Remove">
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                      {b.links.length < 10 && (
                        <button onClick={() => update(b.id, { links: [...b.links, 'https://'] })} className="text-sm font-medium text-zinc-600 hover:underline">
                          + Add social link
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ['link', Link2, 'Link'],
                  ['heading', Heading, 'Heading'],
                  ['text', Type, 'Text'],
                  ['socials', Share2, 'Social icons'],
                ] as const
              ).map(([t, I, l]) => (
                <button key={t} onClick={() => add(t)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm hover:border-zinc-400 hover:bg-zinc-50">
                  <Plus size={14} /> <I size={14} /> {l}
                </button>
              ))}
            </div>
          </section>

          {/* Theme */}
          <section className="space-y-4">
            <h2 className="font-semibold">Appearance</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {presets.map((p) => (
                <button key={p.name} onClick={() => setTheme(p.theme)} className="rounded-xl p-3 text-left ring-1 ring-zinc-200 hover:ring-zinc-400" style={{ background: p.theme.background, color: p.theme.text }}>
                  <span className="block text-sm font-semibold">{p.name}</span>
                  <span
                    className="mt-2 block h-5 w-full"
                    style={{
                      background: p.theme.buttonStyle === 'outline' ? 'transparent' : p.theme.button,
                      border: p.theme.buttonStyle === 'outline' ? `2px solid ${p.theme.button}` : undefined,
                      borderRadius: p.theme.rounded === 'full' ? 999 : p.theme.rounded === 'md' ? 6 : 0,
                    }}
                  />
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['background', 'Background'],
                  ['text', 'Text'],
                  ['button', 'Button'],
                  ['buttonText', 'Button text'],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex items-center gap-3 text-sm">
                  <input type="color" value={theme[k]} onChange={(e) => setTheme({ ...theme, [k]: e.target.value })} className="h-8 w-10" />
                  {l}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <Seg label="Buttons" value={theme.buttonStyle} options={['filled', 'outline', 'soft'] as const} onChange={(v) => setTheme({ ...theme, buttonStyle: v })} />
              <Seg label="Corners" value={theme.rounded} options={['none', 'md', 'full'] as const} onChange={(v) => setTheme({ ...theme, rounded: v })} />
            </div>
          </section>

          <button
            onClick={async () =>
              (await confirmDialog('Delete this bio page?', { body: 'Its link will stop working.', confirm: 'Delete', danger: true })) &&
              start(async () => {
                await deleteBioPage(initial.id)
                router.push('/app/bio')
              })
            }
            className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:underline"
          >
            <Trash2 size={15} /> Delete page
          </button>
        </div>

        {/* Phone preview */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-sm font-semibold">Preview</p>
          <div className="mx-auto h-[640px] w-[320px] overflow-hidden rounded-[2.5rem] border-[10px] border-zinc-900 bg-white shadow-xl">
            <div className="h-full overflow-y-auto [color-scheme:light]">
              <BioView preview title={title || 'Your title'} bio={bio} avatar={avatar?.url ?? null} theme={theme} blocks={blocks} linkHref={(b) => b.url} />
            </div>
          </div>
        </aside>
      </div>

      {picker && <MediaPicker max={1} onClose={() => setPicker(false)} onPick={(items) => items[0] && setAvatar(items[0])} />}
    </div>
  )
}

function Mini({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="grid h-7 w-7 place-items-center rounded-md hover:bg-zinc-100">
      {children}
    </button>
  )
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>
      <div className="flex rounded-lg bg-zinc-100 p-0.5">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)} className={`rounded-md px-3 py-1 capitalize ${value === o ? 'bg-white font-medium shadow-sm' : 'text-zinc-500'}`}>
            {o === 'md' ? 'Rounded' : o}
          </button>
        ))}
      </div>
    </div>
  )
}
