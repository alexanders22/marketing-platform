import type { Metadata } from 'next'
import Link from 'next/link'
import { Compass, Plus } from 'lucide-react'
import { requireContext } from '@/lib/context'
import { formatMoney } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { OBJECTIVES } from '@/lib/strategist'

export const metadata: Metadata = { title: 'Strategy — Loudpilot' }

const STATUS = {
  DRAFT: 'bg-zinc-100 text-zinc-600',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  ARCHIVED: 'bg-zinc-100 text-zinc-400',
}

export default async function StrategyPage() {
  const { workspace, role } = await requireContext()
  const plans = await prisma.strategyPlan.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] })
  const canEdit = role !== 'EDITOR'
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Strategy</h1>
          <p className="text-sm text-zinc-500">Tell Loudpilot what you want to achieve. Your AI strategist plans the audiences, budget, ads, posts and goals.</p>
        </div>
        {canEdit && (
          <Link href="/app/strategy/new" className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">
            <Plus size={16} /> New plan
          </Link>
        )}
      </div>
      {plans.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
            <Compass size={22} />
          </span>
          <h2 className="mt-4 text-lg font-semibold">“I want more sales” is enough to start</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            The strategist reads your dossier — website, past posts and ads — and comes back with a plan you approve piece by piece.
          </p>
          {canEdit && (
            <Link href="/app/strategy/new" className="mt-5 inline-flex rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white">
              Ask the strategist
            </Link>
          )}
        </section>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {plans.map((p) => (
            <li key={p.id}>
              <Link href={`/app/strategy/${p.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-zinc-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.title}</p>
                  <p className="truncate text-sm text-zinc-500">“{p.goal}”</p>
                </div>
                <span className="text-xs text-zinc-500">
                  {OBJECTIVES.find((o) => o.id === p.objective)?.label} · {p.startsOn} – {p.endsOn}
                  {p.budget ? ` · ${formatMoney(p.budget, p.currency)}` : ''}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[p.status]}`}>{p.status.toLowerCase()}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
