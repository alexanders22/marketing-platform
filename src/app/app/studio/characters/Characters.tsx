'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ImagePlus, Loader2, Plus, Trash2, UserRound, X } from 'lucide-react'
import { VideoMediaPicker } from '../video/VideoMediaPicker'
import { deleteCharacter, saveCharacter } from './actions'
import { confirmDialog } from '@/components/ui/Dialog'

export type CharacterCard = { id: string; name: string; description: string; person: boolean; photos: { id: string; url: string }[] }

const EMPTY = { id: null as string | null, name: '', description: '', person: true, consent: false, photos: [] as { id: string; url: string }[] }

export function Characters({ characters, paid }: { characters: CharacterCard[]; paid: boolean }) {
  const router = useRouter()
  const [form, setForm] = useState<typeof EMPTY | null>(null)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()

  const save = () =>
    start(async () => {
      if (!form) return
      setError(undefined)
      const res = await saveCharacter({ id: form.id, name: form.name, description: form.description, photoIds: form.photos.map((p) => p.id), person: form.person, consent: form.consent })
      if (res.error) return setError(res.error)
      setForm(null)
      router.refresh()
    })

  return (
    <section aria-labelledby="characters-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 id="characters-heading" className="inline-flex items-center gap-2 text-lg font-semibold">
            <UserRound size={19} /> Characters
          </h1>
          <p className="text-sm text-zinc-500">
            A person, mascot or product that looks the same in every AI clip — for example your agent presenting different homes. Add 1–3 clear
            photos; Google Veo keeps their look and you describe what they do.
          </p>
        </div>
        {!form && (
          <button onClick={() => setForm({ ...EMPTY })} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
            <Plus size={15} /> New character
          </button>
        )}
      </div>

      {!paid && (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600 ring-1 ring-zinc-200">
          You can prepare characters now; using them in AI clips is part of paid plans.{' '}
          <Link href="/app/plan" className="font-medium text-indigo-600 underline">
            Choose a plan
          </Link>
        </p>
      )}

      {form && (
        <div className="space-y-4 rounded-2xl border border-zinc-200 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Nino, our agent" className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal outline-none focus:border-zinc-400" />
            </label>
            <label className="block text-sm font-medium">
              Look and style (optional)
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. woman in her 30s, navy blazer, friendly"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal outline-none focus:border-zinc-400"
              />
            </label>
          </div>
          <div>
            <p className="text-sm font-medium">Photos · {form.photos.length}/3</p>
            <p className="text-xs text-zinc-500">Clear, well-lit, one subject. Different angles help.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {form.photos.map((p) => (
                <span key={p.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-24 w-24 rounded-xl object-cover ring-1 ring-zinc-200" />
                  <button
                    onClick={() => setForm({ ...form, photos: form.photos.filter((x) => x.id !== p.id) })}
                    aria-label="Remove photo"
                    className="absolute -top-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full bg-white shadow ring-1 ring-zinc-200"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              {form.photos.length < 3 && (
                <button onClick={() => setPicking(true)} className="grid h-24 w-24 place-items-center rounded-xl border border-dashed border-zinc-300 text-zinc-500 hover:bg-zinc-50" aria-label="Add photos">
                  <ImagePlus size={20} />
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.person} onChange={(e) => setForm({ ...form, person: e.target.checked, consent: false })} /> This is a real person
            </label>
            {form.person && (
              <label className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">
                <input type="checkbox" className="mt-0.5" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
                <span>I am this person or have their permission to make videos with their likeness. No children.</span>
              </label>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">
              {pending && <Loader2 size={14} className="animate-spin" />} Save character
            </button>
            <button onClick={() => setForm(null)} className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
              Cancel
            </button>
          </div>
        </div>
      )}

      {characters.length === 0 && !form ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-14 text-center text-sm text-zinc-500">No characters yet.</div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-label="Characters">
          {characters.map((c) => (
            <li key={c.id} className="group relative">
              <button onClick={() => setForm({ id: c.id, name: c.name, description: c.description, person: c.person, consent: c.person, photos: c.photos })} className="block w-full text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.photos[0]?.url} alt="" className="aspect-square w-full rounded-xl object-cover ring-1 ring-zinc-200 group-hover:ring-zinc-400" />
                <p className="mt-1.5 truncate text-sm font-medium">{c.name}</p>
                <p className="truncate text-xs text-zinc-500">
                  {c.photos.length} photo{c.photos.length === 1 ? '' : 's'}
                  {c.description && ` · ${c.description}`}
                </p>
              </button>
              <button
                onClick={async () => (await confirmDialog(`Delete “${c.name}”?`, { confirm: 'Delete', danger: true })) && start(async () => { await deleteCharacter(c.id); router.refresh() })}
                aria-label={`Delete ${c.name}`}
                className="absolute top-1.5 right-1.5 hidden rounded-md bg-white/90 p-1 text-zinc-700 group-hover:block hover:text-red-600"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {picking && form && (
        <VideoMediaPicker
          kind="visual"
          multiple
          onClose={() => setPicking(false)}
          onPick={(items) => {
            const imgs = items.filter((i) => i.kind === 'image').map((i) => ({ id: i.id, url: i.url }))
            const merged = [...form.photos, ...imgs].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i).slice(0, 3)
            setForm({ ...form, photos: merged })
            setPicking(false)
          }}
        />
      )}
    </section>
  )
}
