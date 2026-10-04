import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PauseCircle } from 'lucide-react'
import { Logo } from '@/components/landing/Logo'
import { listCompanies } from '@/lib/context'
import { requireUser } from '@/lib/session'
import { logout } from '../(auth)/actions'
import { switchCompany } from '../app/companies/actions'

export const metadata: Metadata = { title: 'Company paused — Loudpilot' }

// Where members of a paused company land. Other companies stay one click away.
export default async function PausedPage() {
  const user = await requireUser()
  const companies = await listCompanies(user.id)
  if (companies.length === 0) redirect('/onboarding')
  const active = companies.filter((c) => !c.paused)
  const paused = companies.filter((c) => c.paused)
  if (paused.length === 0) redirect('/app')
  const pausedAccounts = [...new Set(paused.map((c) => c.accountName))]

  return (
    <div className="min-h-screen bg-[#f4f3f1] px-4 py-16 text-zinc-900 [color-scheme:light]">
      <div className="mx-auto max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <PauseCircle size={26} />
          </span>
          <h1 className="mt-5 text-xl font-semibold">
            {pausedAccounts.length === 1 ? `${pausedAccounts[0]} is paused` : 'Your accounts are paused'}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Nothing is published or charged while it is paused. Write to{' '}
            <a href="mailto:info@loudpilot.app" className="font-medium text-zinc-900 underline">
              info@loudpilot.app
            </a>{' '}
            to resume.
          </p>
          {active.length > 0 && (
            <div className="mt-6 text-left">
              <p className="text-xs font-semibold tracking-wide text-zinc-500">SWITCH TO</p>
              <ul className="mt-2 space-y-1.5">
                {active.map((c) => (
                  <li key={c.id}>
                    <form action={switchCompany.bind(null, c.id)}>
                      <button className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm font-medium hover:bg-zinc-50">
                        {c.name}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <form action={logout} className="mt-6">
            <button className="text-sm text-zinc-500 hover:text-zinc-900">Log out</button>
          </form>
        </div>
      </div>
    </div>
  )
}
