import type { Metadata } from 'next'
import Link from 'next/link'
import { requireContext } from '@/lib/context'
import { companyLimit } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { Onboarding } from '../Onboarding'

export const metadata: Metadata = { title: 'Add a company — Loudpilot' }

export default async function AddCompanyPage() {
  const { account, asAdmin } = await requireContext()
  const limit = companyLimit(account.plan)
  const count = await prisma.workspace.count({ where: { accountId: account.id } })
  if (!asAdmin && count >= limit) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f3f1] p-4 text-zinc-900 [color-scheme:light]">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
          <h1 className="text-xl font-semibold">Company limit reached</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {account.plan === 'NONE'
              ? 'Choose a plan to add more companies.'
              : `Your plan includes ${limit} compan${limit === 1 ? 'y' : 'ies'} and you have ${count}. Upgrade to add more.`}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link href="/app" className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold hover:bg-zinc-50">
              Back
            </Link>
            <Link href="/app/plan" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
              See plans
            </Link>
          </div>
        </div>
      </main>
    )
  }
  return <Onboarding mode="company" />
}
