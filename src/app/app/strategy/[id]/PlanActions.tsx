'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Check, Copy, ImagePlus, Loader2, Rocket } from 'lucide-react'
import { applyPlanGoals, applyPlanPosts, archivePlan, launchPlan, makePlanVisuals, markAdLaunched } from '../actions'
import { ask } from '@/components/ui/Dialog'
import { creditsLabel } from '@/lib/pricing'

export type VisualsNeed = { posts: number; images: number; videos: number; credits: number }

// Before the plan's posts go to the Planner: with AI pictures and videos, or text only?
async function askVisuals(v: VisualsNeed): Promise<'visuals' | 'text' | null> {
  if (v.posts === 0) return 'text'
  const parts = [v.images && `${v.images} image${v.images === 1 ? '' : 's'}`, v.videos && `${v.videos} short video${v.videos === 1 ? '' : 's'}`].filter(Boolean).join(' and ')
  const id = await ask({
    title: 'Publish the posts without pictures and videos?',
    body: (
      <>
        <p>
          {v.posts} post{v.posts === 1 ? ' has' : 's have'} only text so far. Loudpilot can make {parts} for them first, then put them in the Planner.
        </p>
        <p className="mt-2 text-xs text-zinc-500">Videos are vertical Reels from AI images with motion — open one in Studio → Video to add text or a voice-over.</p>
      </>
    ),
    choices: [
      { id: 'cancel', label: 'Cancel', tone: 'plain' },
      { id: 'text', label: 'Text only', tone: 'plain' },
      { id: 'visuals', label: `Make them · ${creditsLabel(v.credits)}`, tone: 'primary' },
    ],
  })
  return id === 'visuals' || id === 'text' ? id : null
}
import { confirmDialog } from '@/components/ui/Dialog'

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

export function ApplyButton({ planId, kind, count, done, visuals }: { planId: string; kind: 'posts' | 'goals'; count: number; done: number; visuals?: VisualsNeed }) {
  const { pending, msg, run } = useAction()
  const left = count - done
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending || left === 0}
        onClick={async () => {
          const how = kind === 'posts' && visuals ? await askVisuals(visuals) : 'text'
          if (!how) return
          run(
            () => (kind === 'posts' ? applyPlanPosts(planId, undefined, how === 'visuals') : applyPlanGoals(planId)),
            (n) => (kind === 'posts' ? `${n} posts added to the Planner as drafts${how === 'visuals' ? ' — pictures and videos are on the way' : ''}.` : `${n} goals are now being watched.`),
          )
        }}
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
      onClick={async () => (await confirmDialog('Archive this plan?', { body: 'Posts and goals already applied stay.', confirm: 'Archive' })) && run(() => archivePlan(planId), () => '')}
      className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100"
    >
      Archive
    </button>
  )
}

// One click: the plan's posts into the Planner and its goals watched.
export function LaunchPlan({ planId, left, visuals }: { planId: string; left: number; visuals: VisualsNeed }) {
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
        onClick={async () => {
          const how = await askVisuals(visuals)
          if (!how) return
          start(async () => {
            const res = await launchPlan(planId, how === 'visuals')
            setMsg(res.error ?? `${res.posts ?? 0} posts in the Planner, ${res.goals ?? 0} goals watched${how === 'visuals' && res.posts ? ' — pictures and videos are on the way' : ''}.`)
            router.refresh()
          })
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        <Rocket size={15} /> {pending ? 'Launching…' : 'Launch the plan'}
      </button>
      {msg && <span className="text-sm text-zinc-600">{msg}</span>}
    </span>
  )
}

// Pictures and videos for the plan's posts: progress while they are made
// (the page refreshes itself), or a button for posts still without any.
export function PlanVisuals({ planId, running, total, left, credits, outOfCredits, canEdit }: { planId: string; running: boolean; total: number; left: number; credits: number; outOfCredits: boolean; canEdit: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(t)
  }, [running, router])

  if (running) {
    const done = Math.max(0, total - left)
    return (
      <div className="mb-3 rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-900" role="status">
        <p className="flex items-center gap-2 font-medium">
          <Loader2 size={15} className="animate-spin" /> Making pictures and videos… {done} of {total}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-violet-100">
          <div className="h-full rounded-full bg-gradient-to-r from-[#7b3ff2] to-[#ff2e6e] transition-all" style={{ width: `${Math.max(4, (done / Math.max(1, total)) * 100)}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-violet-700">They appear on the posts in the Planner as they are ready — you can leave this page.</p>
      </div>
    )
  }
  if (left === 0) return null
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <ImagePlus size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">
        {left} post{left === 1 ? '' : 's'} in the Planner {left === 1 ? 'has' : 'have'} no picture or video yet.
        {outOfCredits && ' Credits ran out last time.'}
      </span>
      {canEdit && (
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await makePlanVisuals(planId)
              setError(res.error)
              router.refresh()
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} Make them · {creditsLabel(credits)}
        </button>
      )}
      {error && <span className="w-full text-xs text-red-700">{error}</span>}
    </div>
  )
}
