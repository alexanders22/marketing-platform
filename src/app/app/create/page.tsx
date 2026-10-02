import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { Composer } from './Composer'

export const metadata: Metadata = { title: 'Create — Khma' }

export default async function CreatePage() {
  const { account } = await requireContext()
  return <Composer credits={account.creditBalance} />
}
