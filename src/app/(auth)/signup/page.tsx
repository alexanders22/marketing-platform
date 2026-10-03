import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { googleEnabled } from '@/lib/google'
import { mailEnabled } from '@/lib/mail'
import { getSessionUser } from '@/lib/session'
import { AuthCard } from '../AuthCard'

export const metadata: Metadata = { title: 'Sign up — Loudpilot' }

export default async function SignupPage() {
  if (await getSessionUser()) redirect('/app')
  return <AuthCard mode="signup" googleEnabled={googleEnabled()} mailEnabled={mailEnabled()} />
}
