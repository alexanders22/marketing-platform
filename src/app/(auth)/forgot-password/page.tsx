import type { Metadata } from 'next'
import { ForgotForm } from './ForgotForm'

export const metadata: Metadata = { title: 'Reset password — Khma' }

export default function ForgotPasswordPage() {
  return <ForgotForm />
}
