'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Field, FormError, Input, SubmitButton } from '@/components/ui/form'
import { signup } from '../actions'

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined)
  return (
    <form action={action} className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-zinc-400">7 days free. No credit card.</p>
      </div>
      <FormError message={state?.error} />
      <Field label="Your name">
        <Input name="name" autoComplete="name" required defaultValue={state?.fields?.name} />
      </Field>
      <Field label="Brand or company">
        <Input name="brand" autoComplete="organization" required defaultValue={state?.fields?.brand} />
      </Field>
      <Field label="Work email">
        <Input name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} />
      </Field>
      <Field label="Password" hint="At least 8 characters">
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <label className="flex items-start gap-2.5 text-sm text-zinc-400">
        <input name="terms" type="checkbox" required className="mt-0.5 h-4 w-4 accent-white" />
        <span>I agree to the Terms of Service and Privacy Policy</span>
      </label>
      <SubmitButton pending={pending}>Create account</SubmitButton>
      <p className="text-center text-sm text-zinc-400">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-white hover:underline">
          Log in
        </Link>
      </p>
    </form>
  )
}
