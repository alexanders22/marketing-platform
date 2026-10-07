'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { syncAds } from './actions'
import { alertDialog } from '@/components/ui/Dialog'

export function SyncButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      onClick={() =>
        start(async () => {
          const res = await syncAds()
          if (res.error) alertDialog('Sync failed', res.error)
          router.refresh()
        })
      }
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium hover:bg-zinc-50 disabled:opacity-60"
    >
      <RefreshCw size={13} className={pending ? 'animate-spin' : ''} /> {pending ? 'Syncing…' : 'Sync now'}
    </button>
  )
}
