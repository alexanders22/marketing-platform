import type { Metadata } from 'next'
import { LayoutTemplate, Plus, Search } from 'lucide-react'
import { EmptyState, SoonButton } from '@/components/EmptyState'

export const metadata: Metadata = { title: 'Studio — Khma' }

export default function StudioPage() {
  return (
    <>
      <section className="rounded-2xl bg-[linear-gradient(120deg,#fdf2f8,#f5f3ff_45%,#ecfeff)] px-6 py-12 text-center">
        <h1 className="inline-flex items-center gap-3 text-2xl font-semibold sm:text-3xl">
          <LayoutTemplate size={26} /> Design studio
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-zinc-600">
          Posts, stories and ad creatives in your brand colours and fonts. Start from a template or let the AI draft a
          design for you.
        </p>
        <div className="mt-6 flex justify-center">
          <SoonButton>
            <Plus size={16} /> New design
          </SoonButton>
        </div>
      </section>

      <div className="mt-10">
        <h2 className="font-semibold">Recent designs</h2>
        <p className="text-sm text-zinc-500">Find and reopen your latest studio designs.</p>
        <div className="relative mt-4 max-w-xs">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
          <input
            placeholder="Search"
            className="w-full rounded-lg border border-zinc-200 py-2 pr-3 pl-9 text-sm outline-none focus:border-zinc-400"
          />
        </div>
        <div className="mt-4 rounded-xl border border-zinc-200">
          <EmptyState icon={LayoutTemplate} title="No designs yet">
            Designs you create in Studio will show up here, ready to use in your next post.
          </EmptyState>
        </div>
      </div>
    </>
  )
}
