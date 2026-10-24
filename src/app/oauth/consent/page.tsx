import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Check, ShieldAlert } from 'lucide-react'
import { Logo } from '@/components/landing/Logo'
import { checkAuthorize, redirectTarget, type AuthorizeParams } from '@/lib/oauth'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/session'
import { ConsentForm } from './ConsentForm'

export const metadata: Metadata = { title: 'Connect an AI assistant — Loudpilot' }

const CAN = [
  'Read your dossier, results, goals, alerts and weekly reviews',
  'Create posts and drafts in your Planner, and publish them when you ask',
  'Create goals, apply recommendations and ask the strategist',
  'Spend credits on AI writing — only when you ask it to',
]

export default async function ConsentPage({ searchParams }: PageProps<'/oauth/consent'>) {
  const q = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, typeof v === 'string' ? v : ''])) as Partial<AuthorizeParams>
  const user = await getSessionUser()
  if (!user) redirect(`/oauth/authorize?${new URLSearchParams(q as Record<string, string>).toString()}`)
  const check = await checkAuthorize(q)
  const target = check.client ? redirectTarget(q.redirect_uri!) : null
  const workspaces = await prisma.workspace.findMany({
    where: { account: { members: { some: { userId: user.id } } } },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className="grid min-h-screen place-items-center bg-[#f4f3f1] p-4 text-zinc-900 [color-scheme:light]">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-sm ring-1 ring-black/5">
        <div className="text-zinc-900">
          <Logo />
        </div>
        {check.error || !check.client || !target ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{check.error ?? 'Unknown app'}</p>
        ) : workspaces.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-600">
            Finish setting up your company in Loudpilot first, then connect again.{' '}
            <a href="/onboarding" className="font-medium underline">
              Set up
            </a>
          </p>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold">
              <span className="text-indigo-600">{check.client.name}</span> wants to work in Loudpilot
            </h1>
            <p className="mt-1 text-sm text-zinc-500">Signed in as {user.email}</p>
            {/* Any app can register itself and pick its name, so the address it
                returns to is the one fact the user can check. */}
            <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200" data-testid="oauth-target">
              <p className="flex items-center gap-1.5 font-medium">
                <ShieldAlert size={15} className="shrink-0" /> Unverified third-party app
              </p>
              <p className="mt-1">
                It will send you back to <strong className="break-all font-semibold">{target.host}</strong>
                {target.local && ' (an app on this computer)'}.
              </p>
              <p className="mt-1 text-xs text-amber-800/80">
                Loudpilot has not checked who made it; the name &ldquo;{check.client.name}&rdquo; is its own. Allow only if you started this connection and know this address.
              </p>
            </div>
            <ul className="mt-5 space-y-2 text-sm text-zinc-700">
              {CAN.map((c) => (
                <li key={c} className="flex gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /> {c}
                </li>
              ))}
            </ul>
            <ConsentForm params={q as AuthorizeParams} workspaces={workspaces} />
            <p className="mt-4 text-xs text-zinc-400">You can disconnect it any time in Loudpilot → AI assistants.</p>
          </>
        )}
      </div>
    </div>
  )
}
