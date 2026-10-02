import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { SignupForm } from './SignupForm'

export const metadata: Metadata = { title: 'Create your account — Khma' }

export default async function SignupPage() {
  if (await getSessionUser()) redirect('/app')
  return <SignupForm />
}
