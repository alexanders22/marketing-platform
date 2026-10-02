import Link from 'next/link'
import { Logo } from '@/components/landing/Logo'

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="relative flex min-h-screen flex-col items-center px-4 py-10">
      <div className="glow pointer-events-none absolute inset-0" />
      <Link href="/" className="relative mb-10" aria-label="Khma home">
        <Logo />
      </Link>
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/80 p-6 shadow-2xl shadow-black/40 sm:p-8">
        {children}
      </div>
    </div>
  )
}
