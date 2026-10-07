'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { disconnectAccount } from './actions'
import { confirmDialog, alertDialog } from '@/components/ui/Dialog'

export function DisconnectButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      disabled={pending}
      onClick={async () =>
        (await confirmDialog(`Disconnect ${name}?`, { body: 'Its token and the results Loudpilot read from it are deleted.', confirm: 'Disconnect', danger: true })) &&
        start(async () => {
          const res = await disconnectAccount(id)
          if (res.error) alertDialog('Could not disconnect', res.error)
          router.refresh()
        })
      }
      className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      aria-label={`Disconnect ${name}`}
    >
      {pending ? '…' : 'Disconnect'}
    </button>
  )
}
