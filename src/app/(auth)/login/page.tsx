import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { googleEnabled } from '@/lib/google'
import { mailEnabled } from '@/lib/mail'
import { getSessionUser } from '@/lib/session'
import { AuthCard } from '../AuthCard'

export const metadata: Metadata = { title: 'Log in — Loudpilot' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  if (await getSessionUser()) redirect('/app')
  const { error } = await searchParams
  return (
    <AuthCard
      mode="login"
      googleEnabled={googleEnabled()}
      mailEnabled={mailEnabled()}
      error={typeof error === 'string' ? error : undefined}
    />
  )
}
