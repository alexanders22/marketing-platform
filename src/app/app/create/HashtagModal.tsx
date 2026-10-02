'use client'

import { useState, useTransition } from 'react'
import { Hash, Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Popover'
import { deleteHashtagLibrary, saveHashtagLibrary } from './actions'

export type Library = { id: string; name: string; tags: string[] }

const input =
  'w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100'

// "Create new" opens straight into the editor; "Manage" opens the list.
export function HashtagModal({
  mode,
  libraries,
  onClose,
  onChange,
}: {
  mode: 'create' | 'manage'
  libraries: Library[]
  onClose: () => void
  onChange: (libs: Library[], createdName?: string) => void
}) {
  const [editing, setEditing] = useState<Library | 'new' | null>(mode === 'create' ? 'new' : null)
  const [name, setName] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()

  const edit = (lib: Library | 'new') => {
    setEditing(lib)
    setName(lib === 'new' ? '' : lib.name)
    setTags(lib === 'new' ? '' : lib.tags.map((t) => `#${t}`).join(' '))
    setError(undefined)
  }

  const save = () =>
    start(async () => {
      const res = await saveHashtagLibrary({ id: editing && editing !== 'new' ? editing.id : undefined, name, tags })
      if ('error' in res && res.error) return setError(res.error)
      if ('libraries' in res && res.libraries) {
        onChange(res.libraries, editing === 'new' ? name.trim() : undefined)
        if (mode === 'create') onClose()
        else setEditing(null)
      }
    })

  const remove = (id: string) =>
    start(async () => {
      const res = await deleteHashtagLibrary(id)
      onChange(res.libraries)
    })

  if (editing) {
    // Same rule as the server: letters, digits and _, de-duplicated ignoring case.
    const count = new Set(
      tags
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#+/, '').toLowerCase())
        .filter((t) => /^[\p{L}\p{N}_]{1,60}$/u.test(t)),
    ).size
    return (
      <Modal title={editing === 'new' ? 'New hashtag library' : 'Edit hashtag library'} onClose={onClose}>
        <label className="block text-sm font-medium">Name</label>
        <input
          className={`${input} mt-1.5`}
          placeholder="e.g. Brand basics, Summer sale"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <label className="mt-4 block text-sm font-medium">Hashtags</label>
        <textarea
          className={`${input} mt-1.5 min-h-28 resize-y`}
          placeholder="#tbilisi #georgia #travel"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <p className={`mt-1 text-xs ${count > 30 ? 'font-medium text-red-600' : 'text-zinc-500'}`}>
          Separate with spaces or commas. {count}/30 hashtags{count > 30 ? ' — remove some to save.' : '.'}
        </p>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => (mode === 'create' ? onClose() : setEditing(null))}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save library'}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Hashtag libraries" onClose={onClose}>
      {libraries.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">No hashtag libraries yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {libraries.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
              <Hash size={16} className="shrink-0 text-zinc-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="truncate text-xs text-zinc-500">{l.tags.map((t) => `#${t}`).join(' ')}</p>
              </div>
              <button onClick={() => edit(l)} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100" aria-label={`Edit ${l.name}`}>
                <Pencil size={15} />
              </button>
              <button
                onClick={() => remove(l.id)}
                disabled={pending}
                className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                aria-label={`Delete ${l.name}`}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => edit('new')}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 py-2.5 text-sm font-medium hover:bg-zinc-200"
      >
        <Plus size={15} /> Create new
      </button>
    </Modal>
  )
}
