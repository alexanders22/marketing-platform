import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { consumeMagicLink } from '../../actions'

export const metadata: Metadata = { title: 'Sign in — Loudpilot' }

// The emailed link lands here; signing in needs one click, so link scanners
// that only GET the page cannot use up the token.
export default async function MagicLinkPage({ searchParams }: PageProps<'/auth/magic'>) {
  const { token } = await searchParams
  if (typeof token !== 'string' || !token) redirect('/login?error=link')
  return (
    <form action={consumeMagicLink} className="text-center">
      <input type="hidden" name="token" value={token} />
      <h1 className="text-xl font-semibold">Sign in to Loudpilot</h1>
      <p className="mt-1 text-sm text-zinc-500">Confirm it&apos;s you to continue.</p>
      <button className="mt-6 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">
        Continue
      </button>
    </form>
  )
}
