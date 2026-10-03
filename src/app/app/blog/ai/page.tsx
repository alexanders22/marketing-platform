import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { AiBlogForm } from './AiBlogForm'

export const metadata: Metadata = { title: 'New AI blog — Loudpilot' }

export default async function AiBlogPage() {
  const { account } = await requireContext()
  return <AiBlogForm credits={account.creditBalance} />
}
