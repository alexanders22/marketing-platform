'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Copy, LayoutTemplate, Loader2, Search, Trash2 } from 'lucide-react'
import { DesignPreview } from '@/components/DesignCanvas'
import { palette, resizeDoc, SIZES, TEMPLATES, type DesignDoc } from '@/lib/design'
import { createDesign, deleteDesign, duplicateDesign } from './actions'

type Design = { id: string; name: string; width: number; height: number; data: DesignDoc; preview: string | null; updatedAt: string }

export function StudioHome({
  brandName,
  colors,
  designs,
  forPost,
}: {
  brandName: string
  colors: string[]
  designs: Design[]
  // Opened from a post: designs open with "Save to post".
  forPost?: string
}) {
  const q2 = forPost ? `?post=${forPost}` : ''
  const router = useRouter()
  const [size, setSize] = useState<string>(SIZES[0].id)
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [, start] = useTransition()
  const pal = palette(colors)
  const sz = SIZES.find((s) => s.id === size)!

  const create = (templateId: string) => {
    setBusy(templateId)
    start(async () => {
      const res = await createDesign(size, templateId)
      router.push(`/app/studio/${res.id}${q2}`)
    })
  }

  const shown = designs.filter((d) => d.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <section className="rounded-2xl bg-[linear-gradient(120deg,#fdf2f8,#f5f3ff_45%,#ecfeff)] px-6 py-10 text-center">
        <h1 className="inline-flex items-center gap-3 text-2xl font-semibold sm:text-3xl">
          <LayoutTemplate size={26} /> Design studio
        </h1>
        {forPost && (
          <p className="mx-auto mt-3 w-fit rounded-full bg-white/80 px-3 py-1 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200">
            Designing an image for your post —{' '}
            <Link href={`/app/posts/${forPost}`} className="underline">
              back to the post
            </Link>
          </p>
        )}
        <p className="mx-auto mt-3 max-w-xl text-zinc-600">
          Posts, stories and ad creatives in {brandName}&apos;s colours. Pick a format and a template — every template uses
          your brand palette.
        </p>
        <div className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-2">
          {SIZES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSize(s.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                size === s.id ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white/70 hover:border-zinc-400'
              }`}
            >
              {s.name} <span className={size === s.id ? 'text-zinc-400' : 'text-zinc-400'}>{s.w}×{s.h}</span>
            </button>
          ))}
        </div>
      </section>

      <h2 className="mt-10 font-semibold">Templates</h2>
      <p className="text-sm text-zinc-500">Click to start a new {sz.name.toLowerCase()} from a template.</p>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {TEMPLATES.map((t) => {
          const doc = resizeDoc(t.build(pal, brandName), { w: 1080, h: 1080 }, sz)
          return (
            <button key={t.id} onClick={() => create(t.id)} disabled={busy !== null} className="group text-left">
              <div className="relative grid aspect-square place-items-center overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-200 transition group-hover:ring-zinc-400">
                <DesignPreview doc={doc} w={sz.w} h={sz.h} width={sz.w >= sz.h ? 170 : 170 * (sz.w / sz.h)} />
                {busy === t.id && (
                  <span className="absolute inset-0 grid place-items-center bg-white/60">
                    <Loader2 className="animate-spin" />
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm font-medium">{t.name}</p>
            </button>
          )
        })}
      </div>

      <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Recent designs</h2>
          <p className="text-sm text-zinc-500">Find and reopen your latest studio designs.</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search" aria-label="Search designs"
            className="w-full rounded-lg border border-zinc-200 py-2 pr-3 pl-9 text-sm outline-none focus:border-zinc-400"
          />
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="mt-4 rounded-xl border border-zinc-200 py-14 text-center text-sm text-zinc-500">
          {designs.length === 0 ? 'No designs yet — pick a template above.' : 'No designs match your search.'}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {shown.map((d) => (
            <div key={d.id} className="group relative">
              <Link href={`/app/studio/${d.id}${q2}`} className="block">
                <div className="grid aspect-square place-items-center overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-200 transition group-hover:ring-zinc-400">
                  {d.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.preview} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <DesignPreview doc={d.data} w={d.width} h={d.height} width={d.width >= d.height ? 180 : 180 * (d.width / d.height)} />
                  )}
                </div>
                <p className="mt-2 truncate text-sm font-medium">{d.name}</p>
                <p className="text-xs text-zinc-500">
                  {d.width}×{d.height} · {new Date(d.updatedAt).toLocaleDateString('en-GB')}
                </p>
              </Link>
              <div className="absolute top-2 right-2 flex gap-1 md:hidden md:group-hover:flex">
                <button
                  onClick={() => start(async () => { const r = await duplicateDesign(d.id); if (r.id) router.refresh() })}
                  className="grid h-7 w-7 place-items-center rounded-lg bg-white shadow"
                  aria-label="Duplicate"
                >
                  <Copy size={13} />
                </button>
                <button
                  onClick={() => confirm(`Delete "${d.name}"?`) && start(async () => { await deleteDesign(d.id); router.refresh() })}
                  className="grid h-7 w-7 place-items-center rounded-lg bg-white text-red-600 shadow"
                  aria-label="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
