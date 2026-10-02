import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ResetForm } from './ResetForm'

export const metadata: Metadata = { title: 'Set a new password — Khma' }

export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const { token } = await searchParams
  if (typeof token !== 'string' || !token) redirect('/forgot-password')
  return <ResetForm token={token} />
}
