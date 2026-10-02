import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Log in — Khma' }

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/app')
  return <LoginForm />
}
