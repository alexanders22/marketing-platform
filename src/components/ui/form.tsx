import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-zinc-200">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-zinc-500">{hint}</span>}
    </label>
  )
}

const control =
  'w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none transition focus:border-white/30 focus:ring-2 focus:ring-white/10'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ''}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${control} min-h-24 resize-y ${props.className ?? ''}`} />
}

export function SubmitButton({ pending, children }: { pending?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-white py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
    >
      {pending ? 'Please wait…' : children}
    </button>
  )
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
      {message}
    </p>
  )
}
