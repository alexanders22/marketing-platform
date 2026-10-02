'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { createBioPage } from './actions'

export function NewBioButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      onClick={() =>
        start(async () => {
          const { id } = await createBioPage()
          router.push(`/app/bio/${id}`)
        })
      }
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
    >
      {pending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} New bio page
    </button>
  )
}
