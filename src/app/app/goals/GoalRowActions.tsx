'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Pause, Play, Trash2 } from 'lucide-react'
import { deleteGoal, setGoalActive } from './actions'
import { confirmDialog, alertDialog } from '@/components/ui/Dialog'

export function GoalRowActions({ id, active, label }: { id: string; active: boolean; label: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const res = await fn()
      if (res.error) alertDialog('Something went wrong', res.error)
      router.refresh()
    })
  return (
    <div className="flex shrink-0 gap-1">
      <button
        disabled={pending}
        onClick={() => run(() => setGoalActive(id, !active))}
        className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50"
        aria-label={`${active ? 'Pause' : 'Resume'} ${label}`}
        title={active ? 'Pause' : 'Resume'}
      >
        {active ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button
        disabled={pending}
        onClick={async () => (await confirmDialog('Delete this goal?', { confirm: 'Delete', danger: true })) && run(() => deleteGoal(id))}
        className="rounded-lg p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        aria-label={`Delete ${label}`}
        title="Delete"
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}
