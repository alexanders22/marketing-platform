'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CheckCheck } from 'lucide-react'
import { markAlertsRead, setAlertEmails } from './actions'

export function AlertControls({ unread, emails, canEdit }: { unread: string[]; emails: boolean; canEdit: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [on, setOn] = useState(emails)
  return (
    <div className="flex flex-wrap items-center gap-3">
      {canEdit && (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={on}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked
              setOn(next)
              start(async () => {
                const res = await setAlertEmails(next)
                if (res.error) setOn(!next)
                router.refresh()
              })
            }}
            className="h-4 w-4 accent-zinc-900"
          />
          Email me alerts
        </label>
      )}
      {unread.length > 0 && (
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await markAlertsRead(unread)
              router.refresh()
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
        >
          <CheckCheck size={15} /> Mark all read
        </button>
      )}
    </div>
  )
}
