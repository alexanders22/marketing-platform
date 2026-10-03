'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Popover'
import { METRICS, WINDOWS, type GoalScopeId } from '@/lib/goal-metrics'
import { createGoal } from './actions'

const SCOPES: { id: GoalScopeId; label: string; hint: string }[] = [
  { id: 'CAMPAIGN', label: 'One ad campaign', hint: 'e.g. cost per lead of “Spring sale”' },
  { id: 'ADS', label: 'All ads', hint: 'every campaign together' },
  { id: 'POSTS', label: 'Posts', hint: 'reach, views, likes, engagement' },
]

const field = 'w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400'

export function GoalForm({
  campaigns,
  currency,
  hasAds,
  hasPosts,
}: {
  campaigns: { id: string; name: string; status: string }[]
  currency: string | null
  hasAds: boolean
  hasPosts: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<GoalScopeId>(hasAds ? 'CAMPAIGN' : 'POSTS')
  const [campaign, setCampaign] = useState(campaigns.find((c) => c.status === 'ACTIVE')?.id ?? campaigns[0]?.id ?? '')
  const [network, setNetwork] = useState<'' | 'FACEBOOK' | 'INSTAGRAM'>('')
  const metrics = METRICS.filter((m) => m.scopes.includes(scope))
  const [metric, setMetric] = useState(metrics[0].id)
  const def = METRICS.find((m) => m.id === metric) ?? metrics[0]
  const [atMost, setAtMost] = useState(def.atMost)
  const [target, setTarget] = useState('')
  const [windowDays, setWindowDays] = useState(7)
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()

  const pickScope = (s: GoalScopeId) => {
    setScope(s)
    const first = METRICS.find((m) => m.scopes.includes(s))!
    setMetric(first.id)
    setAtMost(first.atMost)
  }
  const pickMetric = (id: string) => {
    setMetric(id)
    setAtMost(METRICS.find((m) => m.id === id)!.atMost)
  }

  const submit = () =>
    start(async () => {
      setError(undefined)
      const res = await createGoal({
        scope,
        adCampaignId: scope === 'CAMPAIGN' ? campaign : undefined,
        network: scope === 'POSTS' ? network || null : null,
        metric,
        atMost,
        target: Number(target.replace(',', '.')),
        windowDays,
      })
      if (res.error) return setError(res.error)
      setOpen(false)
      setTarget('')
      router.refresh()
    })

  const unit = def.kind === 'money' ? (currency ?? '') : def.kind === 'percent' ? '%' : ''

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
      >
        <Plus size={16} /> New goal
      </button>
      {open && (
        <Modal title="New goal" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">What to watch</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {SCOPES.map((s) => {
                  const off = (s.id !== 'POSTS' && !hasAds) || (s.id === 'CAMPAIGN' && campaigns.length === 0) || (s.id === 'POSTS' && !hasPosts)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={off}
                      aria-pressed={scope === s.id}
                      onClick={() => pickScope(s.id)}
                      className={`rounded-xl border p-3 text-left text-sm transition disabled:opacity-40 ${
                        scope === s.id ? 'border-zinc-900 ring-1 ring-zinc-900' : 'border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      <span className="block font-medium">{s.label}</span>
                      <span className="block text-xs text-zinc-500">{off ? 'Connect it in Channels' : s.hint}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {scope === 'CAMPAIGN' && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Campaign</span>
                <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={field}>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.status !== 'ACTIVE' ? `(${c.status.toLowerCase().replace(/_/g, ' ')})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {scope === 'POSTS' && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Network</span>
                <select value={network} onChange={(e) => setNetwork(e.target.value as typeof network)} className={field}>
                  <option value="">Facebook and Instagram</option>
                  <option value="INSTAGRAM">Instagram only</option>
                  <option value="FACEBOOK">Facebook only</option>
                </select>
              </label>
            )}

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Metric</span>
              <select value={metric} onChange={(e) => pickMetric(e.target.value)} className={field}>
                {metrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-zinc-500">{def.hint}</span>
            </label>

            <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto]">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Should be</span>
                <select value={atMost ? 'max' : 'min'} onChange={(e) => setAtMost(e.target.value === 'max')} className={field}>
                  <option value="min">at least</option>
                  <option value="max">at most</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Target {unit && <span className="text-zinc-400">({unit})</span>}</span>
                <input
                  inputMode="decimal"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={def.kind === 'money' ? '5.00' : def.kind === 'percent' ? '1.5' : '1000'}
                  className={field}
                  aria-label="Target"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Over</span>
                <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} className={field}>
                  {WINDOWS.map((w) => (
                    <option key={w.days} value={w.days}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              Checked every hour over complete days. You get an alert when it slips more than 15% past the target, a
              warning when it is close, and a note when it is back on track.
            </p>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={pending || !target}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {pending ? 'Saving…' : 'Create goal'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
