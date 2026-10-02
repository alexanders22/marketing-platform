import type { Metadata } from 'next'
import { Search, Workflow } from 'lucide-react'
import { EmptyState, PageHeader, SoonButton } from '@/components/EmptyState'

export const metadata: Metadata = { title: 'Workflows — Khma' }

export default function WorkflowsPage() {
  return (
    <>
      <PageHeader
        title="Workflows"
        sub="Build automations that react to social activity and brand events."
        action={<SoonButton>New workflow</SoonButton>}
      />
      <div className="relative mb-4 max-w-xs">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
        <input
          placeholder="Search"
          className="w-full rounded-lg border border-zinc-200 py-2 pr-3 pl-9 text-sm outline-none focus:border-zinc-400"
        />
      </div>
      <div className="rounded-xl border border-zinc-200">
        <EmptyState icon={Workflow} title="Create your first workflow">
          Automatically create and publish posts — for example when a new product appears on your site or a new lead
          comes in.
        </EmptyState>
      </div>
    </>
  )
}
