import Link from 'next/link'
import { ArtBackground } from '@/components/ArtBackground'

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <ArtBackground />
      <div className="relative w-full max-w-[420px] rounded-xl bg-white p-6 text-zinc-900 shadow-2xl sm:p-7">
        {children}
      </div>
      <Link
        href="/"
        className="absolute top-5 left-5 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-zinc-900 shadow"
      >
        Khma
      </Link>
    </div>
  )
}
