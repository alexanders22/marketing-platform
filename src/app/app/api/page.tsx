import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, Code2, Lock } from 'lucide-react'
import { CodeBlock } from '@/app/docs/CodeBlock'
import { LocalTime } from '@/components/LocalTime'
import { requireContext } from '@/lib/context'
import { appUrl } from '@/lib/mail'
import { apiAllowed, billingState } from '@/lib/plans'
import { prisma } from '@/lib/prisma'
import { NewApiKey, RevokeKey, WebhookForm } from './ApiControls'

export const metadata: Metadata = { title: 'API — Loudpilot' }

const card = 'rounded-2xl border border-zinc-200 p-5'

export default async function ApiPage() {
  const { account, role, asAdmin } = await requireContext()
  const allowed = apiAllowed(account) || asAdmin
  const state = billingState(account)
  const canManage = role !== 'EDITOR' || asAdmin
  const partner = await prisma.partner.findUnique({
    where: { ownerAccountId: account.id },
    include: { apiKeys: { where: { revokedAt: null }, orderBy: { createdAt: 'desc' } } },
  })
  const companies = await prisma.workspace.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, externalId: true, partnerId: true },
  })
  const base = `${appUrl()}/api/v1`
  const exampleId = companies[0]?.externalId ?? companies[0]?.id ?? 'COMPANY_ID'

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Code2 size={22} /> API
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Connect Loudpilot to your own platform — a CRM, a website builder, a client portal. Create a company for each of your clients,
          let them connect Facebook and Instagram, then read results, goals, alerts and weekly reviews from your system.
        </p>
      </div>

      {!allowed ? (
        <section className={`${card} bg-zinc-50`}>
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white ring-1 ring-zinc-200">
              <Lock size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">The API is part of the Agency plan</h2>
              <p className="text-sm text-zinc-500">
                {state === 'active' ? 'Upgrade to Agency to create API keys.' : 'Choose Agency to use the API after your trial.'} Your existing keys
                stay saved and start working again when the plan allows.
              </p>
            </div>
            <Link href="/app/plan" className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
              See plans
            </Link>
          </div>
        </section>
      ) : (
        state === 'trial' &&
        account.plan !== 'AGENCY' && (
          <p className="rounded-xl bg-violet-50 px-4 py-2.5 text-sm text-violet-900 ring-1 ring-violet-200">
            The API is open during your free trial. After it, it is part of the Agency plan.
          </p>
        )
      )}

      {allowed && canManage && (
        <section className={card}>
          <h2 className="font-semibold">API keys</h2>
          <p className="mt-1 mb-4 text-sm text-zinc-500">A key acts for the whole account — all companies. Use it only from your server.</p>
          <NewApiKey />
          {partner && partner.apiKeys.length > 0 && (
            <ul className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
              {partner.apiKeys.map((k) => (
                <li key={k.id} className="flex min-w-0 flex-wrap items-center gap-3 p-3 text-sm">
                  <code className="font-mono text-xs text-zinc-500">{k.prefix}…</code>
                  <span className="min-w-0 flex-1 truncate font-medium">{k.name}</span>
                  <span className="text-xs text-zinc-500">
                    {k.lastUsedAt ? (
                      <>
                        used <LocalTime iso={k.lastUsedAt.toISOString()} options={{ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }} />
                      </>
                    ) : (
                      'never used'
                    )}
                  </span>
                  <RevokeKey id={k.id} name={k.name} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {allowed && canManage && (
        <section className={card}>
          <h2 className="font-semibold">Webhook</h2>
          <p className="mt-1 mb-4 text-sm text-zinc-500">
            Loudpilot posts events here (an alert fired, a weekly review is ready), signed with the secret below.
          </p>
          <WebhookForm url={partner?.webhookUrl ?? ''} secret={partner?.webhookSecret ?? null} />
        </section>
      )}

      <section className={card}>
        <h2 className="font-semibold">Your companies</h2>
        <p className="mt-1 mb-3 text-sm text-zinc-500">
          The API addresses a company by its id. Companies you create through the API use your own id instead.
        </p>
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm">
          {companies.map((c) => (
            <li key={c.id} className="flex min-w-0 flex-wrap items-center gap-3 p-3">
              <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
              <code className="truncate font-mono text-xs text-zinc-500">{c.partnerId && c.partnerId === partner?.id ? c.externalId : partner ? '—' : c.id}</code>
            </li>
          ))}
        </ul>
        {!partner && <p className="mt-2 text-xs text-zinc-500">Ids become active when you create the first API key.</p>}
      </section>

      <section className={card}>
        <h2 className="font-semibold">Quick start</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-600">
          <li>Check the key works.</li>
          <li>Create (or update) a company for a client — use your own id for it.</li>
          <li>Get a connect link and send the client there to connect Facebook and Instagram.</li>
          <li>Read results: analytics, goals, alerts and the weekly review.</li>
        </ol>
        <CodeBlock
          title="curl"
          tabs={[
            {
              label: 'curl',
              code: `# 1. Check the key
curl ${base}/ping -H "Authorization: Bearer $LOUDPILOT_KEY"

# 2. A company for your client (idempotent)
curl -X POST ${base}/workspaces \\
  -H "Authorization: Bearer $LOUDPILOT_KEY" -H "Content-Type: application/json" \\
  -d '{"externalId":"client-42","name":"Sunrise Residences"}'

# 3. Link for the client to connect Facebook / Instagram
curl -X POST ${base}/workspaces/client-42/connect-links \\
  -H "Authorization: Bearer $LOUDPILOT_KEY" -H "Content-Type: application/json" \\
  -d '{"network":"meta","returnUrl":"https://your-app.com/marketing"}'

# 4. Results of the last 30 days
curl "${base}/workspaces/${exampleId}/analytics?days=30" -H "Authorization: Bearer $LOUDPILOT_KEY"`,
            },
          ]}
        />
        <Link href="/docs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:underline">
          <BookOpen size={15} /> Full API reference
        </Link>
      </section>
    </div>
  )
}
