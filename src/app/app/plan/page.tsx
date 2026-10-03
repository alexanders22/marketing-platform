import type { Metadata } from 'next'
import { PlanPicker } from '@/components/PlanPicker'
import { requireContext } from '@/lib/context'
import type { PlanId } from '@/lib/plans'

export const metadata: Metadata = { title: 'Choose your plan — Loudpilot' }

export default async function PlanPage() {
  const { account } = await requireContext()
  return (
    <div className="-m-2 sm:-m-4">
      <PlanPicker current={account.plan === 'NONE' ? null : (account.plan as PlanId)} after="/app/credits" />
    </div>
  )
}
