import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { Onboarding } from '../Onboarding'

export const metadata: Metadata = { title: 'Add a company — Loudpilot' }

export default async function AddCompanyPage() {
  await requireContext()
  return <Onboarding mode="company" />
}
