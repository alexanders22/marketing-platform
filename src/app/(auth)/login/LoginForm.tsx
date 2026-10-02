'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Field, FormError, Input, SubmitButton } from '@/components/ui/form'
import { login } from '../actions'

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined)
  return (
    <form action={action} className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-sm text-zinc-400">Log in to your Khma workspace.</p>
      </div>
      <FormError message={state?.error} />
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton pending={pending}>Log in</SubmitButton>
      <p className="text-center text-sm text-zinc-400">
        New to Khma?{' '}
        <Link href="/signup" className="font-medium text-white hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  )
}
