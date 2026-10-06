'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Copy, Rocket } from 'lucide-react'
import { applyPlanGoals, applyPlanPosts, archivePlan, launchPlan, markAdLaunched } from '../actions'

function useAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const run = (fn: () => Promise<{ error?: string; created?: number }>, ok: (n: number) => string) =>
    start(async () => {
      setMsg({})
      const res = await fn()
      setMsg(res.error ? { error: res.error, ...(res.created ? { ok: ok(res.created) } : {}) } : { ok: ok(res.created ?? 0) })
      router.refresh()
    })
  return { pending, msg, run }
}

export function ApplyButton({ planId, kind, count, done }: { planId: string; kind: 'posts' | 'goals'; count: number; done: number }) {
  const { pending, msg, run } = useAction()
  const left = count - done
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending || left === 0}
        onClick={() =>
          run(
            () => (kind === 'posts' ? applyPlanPosts(planId) : applyPlanGoals(planId)),
            (n) => (kind === 'posts' ? `${n} posts added to the Planner as drafts.` : `${n} goals are now being watched.`),
          )
        }
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-500"
      >
        {left === 0 ? <Check size={15} /> : null}
        {left === 0 ? (kind === 'posts' ? 'All in the Planner' : 'All goals active') : pending ? 'Applying…' : kind === 'posts' ? `Add ${left} posts to Planner` : `Watch ${left} goals`}
      </button>
      {msg.ok && <span className="text-sm text-emerald-700">{msg.ok}</span>}
      {msg.error && <span className="text-sm text-red-600">{msg.error}</span>}
    </div>
  )
}

export function LaunchedToggle({ planId, adId, launched }: { planId: string; adId: string; launched: boolean }) {
  const { pending, run } = useAction()
  const [on, setOn] = useState(launched)
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked
          setOn(next)
          run(async () => {
            const res = await markAdLaunched(planId, adId, next)
            if (res.error) setOn(!next)
            return res
          }, () => '')
        }}
        className="h-4 w-4 accent-zinc-900"
      />
      Launched in Ads Manager
    </label>
  )
}

// Which real Meta campaign this planned ad became — so results can be
// compared with the plan.
export function LinkCampaign({ planId, adId, value, campaigns }: { planId: string; adId: string; value: string | null; campaigns: { id: string; name: string }[] }) {
  const { pending, msg, run } = useAction()
  const [v, setV] = useState(value ?? '')
  if (campaigns.length === 0) return null
  return (
    <label className="inline-flex items-center gap-2 text-sm text-zinc-600">
      Running as
      <select
        value={v}
        disabled={pending}
        aria-label="Linked Meta campaign"
        onChange={(e) => {
          const next = e.target.value
          setV(next)
          run(() => markAdLaunched(planId, adId, Boolean(next), next || null), () => '')
        }}
        className="max-w-56 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm"
      >
        <option value="">— pick the Meta campaign —</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {msg.error && <span className="text-xs text-red-600">{msg.error}</span>}
    </label>
  )
}

export function CopyText({ text, label = 'Copy setup' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // Clipboard blocked.
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : label}
    </button>
  )
}

export function ArchiveButton({ planId }: { planId: string }) {
  const { pending, run } = useAction()
  return (
    <button
      disabled={pending}
      onClick={() => confirm('Archive this plan? Posts and goals already applied stay.') && run(() => archivePlan(planId), () => '')}
      className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100"
    >
      Archive
    </button>
  )
}

// One click: the plan's posts into the Planner and its goals watched.
export function LaunchPlan({ planId, left }: { planId: string; left: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string>()
  if (left === 0) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          <Check size={15} /> Plan launched
        </span>
        {msg && <span className="text-sm text-zinc-600">{msg}</span>}
      </span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await launchPlan(planId)
            setMsg(res.error ?? `${res.posts ?? 0} posts in the Planner, ${res.goals ?? 0} goals watched.`)
            router.refresh()
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        <Rocket size={15} /> {pending ? 'Launching…' : 'Launch the plan'}
      </button>
      {msg && <span className="text-sm text-zinc-600">{msg}</span>}
    </span>
  )
}
