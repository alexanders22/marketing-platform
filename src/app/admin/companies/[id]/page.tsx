import Link from 'next/link'
import { notFound } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { billingState, companyLimit } from '@/lib/plans'
import {
  addMember,
  adjustCredits,
  deleteAccount,
  deleteWorkspace,
  openWorkspace,
  pauseAccount,
  recordPayment,
  removeMember,
  renameWorkspace,
  resumeAccount,
  setMemberRole,
  updateAccount,
} from '../../actions'
import { ActionButton, ActionForm, ConfirmDelete, RoleSelect } from '../../ui'
import { Badge, card, fmtDate, fmtDateTime, planStatus, REASON } from '../../shared'

const input = 'mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400'
const label = 'block text-sm font-medium text-zinc-700'

export default async function AdminCompany({ params }: PageProps<'/admin/companies/[id]'>) {
  const { id } = await params
  const a = await prisma.account.findUnique({
    where: { id },
    include: {
      partner: { select: { name: true } },
      members: { include: { user: { select: { id: true, name: true, email: true, disabledAt: true } } }, orderBy: { id: 'asc' } },
      workspaces: {
        orderBy: { createdAt: 'asc' },
        include: {
          brandKit: { select: { website: true } },
          _count: { select: { socialAccounts: true, posts: true, adCampaigns: true } },
        },
      },
    },
  })
  if (!a) notFound()
  const [entries, logs] = await Promise.all([
    prisma.creditEntry.findMany({ where: { accountId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.adminLog.findMany({
      where: { OR: [{ targetType: 'account', targetId: id }, { details: { path: ['accountId'], equals: id } }] },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])
  const st = planStatus(a)
  const wsNames = new Map(a.workspaces.map((w) => [w.id, w.name]))

  return (
    <div className="space-y-5">
      <Link href="/admin/companies" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Companies
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {a.name} <Badge tone={st.tone}>{st.label}</Badge>
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {a.email} · created {fmtDate(a.createdAt)}
            {a.partner && ` · via partner ${a.partner.name}`}
          </p>
        </div>
        {a.pausedAt ? (
          <ActionButton action={resumeAccount.bind(null, a.id)} tone="dark">
            Resume account
          </ActionButton>
        ) : null}
      </div>

      {a.pausedAt && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Paused since {fmtDateTime(a.pausedAt)}
          {a.pausedReason && <> — {a.pausedReason}</>}. Members are locked out; nothing publishes, syncs or spends credits.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {/* Companies */}
          <section className={card}>
            <h2 className="font-semibold">
              Companies <span className="font-normal text-zinc-500">· {a.workspaces.length} of {companyLimit(a.plan)} on this plan</span>
            </h2>
            <ul className="mt-3 space-y-3">
              {a.workspaces.map((w) => (
                <li key={w.id} className="rounded-xl border border-zinc-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{w.name}</p>
                      <p className="text-xs text-zinc-500">
                        {w._count.socialAccounts} channels · {w._count.posts} posts · {w._count.adCampaigns} ad campaigns
                        {w.brandKit?.website && ` · ${w.brandKit.website}`}
                      </p>
                    </div>
                    <ActionButton action={openWorkspace.bind(null, w.id)} tone="dark">
                      Open in app
                    </ActionButton>
                  </div>
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900">Rename or delete</summary>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <ActionForm action={renameWorkspace.bind(null, w.id)} submit="Rename" tone="light">
                        <label className={label}>
                          Name
                          <input name="name" defaultValue={w.name} className={input} />
                        </label>
                      </ActionForm>
                      <ConfirmDelete action={deleteWorkspace.bind(null, w.id)} expected={w.name} what="company" />
                    </div>
                  </details>
                </li>
              ))}
              {a.workspaces.length === 0 && <li className="text-sm text-zinc-500">No companies.</li>}
            </ul>
          </section>

          {/* Billing */}
          <section className={card}>
            <h2 className="font-semibold">
              Billing{' '}
              <span className="font-normal text-zinc-500">
                ·{' '}
                {{
                  none: 'no plan',
                  trial: `trial until ${a.trialEndsAt ? fmtDate(a.trialEndsAt) : '—'}`,
                  active: `paid until ${a.paidUntil ? fmtDate(a.paidUntil) : '—'}`,
                  expired: 'trial over, not paid',
                }[billingState(a)]}
              </span>
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Book a payment received outside the app. It extends the paid period, ends the trial and grants this month&apos;s plan
              credits; each new month brings the next batch.
            </p>
            <ActionForm action={recordPayment.bind(null, a.id)} submit="Record payment" className="mt-3">
              <input type="hidden" name="key" value={randomUUID()} />
              <div className="grid gap-3 sm:grid-cols-[100px_150px_1fr]">
                <label className={label}>
                  Periods
                  <input name="periods" type="number" min={1} max={24} defaultValue={1} required className={input} />
                </label>
                <label className={label}>
                  Cycle
                  <select name="cycle" defaultValue={a.billingCycle} aria-label="Billing cycle" className={input}>
                    <option value="MONTHLY">Monthly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </label>
                <label className={label}>
                  Note
                  <input name="note" placeholder="e.g. bank transfer #123, 79 USD" required className={input} />
                </label>
              </div>
            </ActionForm>
          </section>

          {/* Credits */}
          <section className={card}>
            <h2 className="font-semibold">
              Credits <span className="font-normal text-zinc-500">· balance {a.creditBalance.toLocaleString()}</span>
            </h2>
            <ActionForm action={adjustCredits.bind(null, a.id)} submit="Book credits" className="mt-3">
              <input type="hidden" name="key" value={randomUUID()} />
              <div className="grid gap-3 sm:grid-cols-[120px_160px_1fr]">
                <label className={label}>
                  Amount
                  <input name="amount" type="number" step={1} placeholder="+100 / -20" required className={input} />
                </label>
                <label className={label}>
                  Type
                  <select name="reason" defaultValue="GRANT" aria-label="Credit type" className={input}>
                    <option value="GRANT">Bonus</option>
                    <option value="PURCHASE">Payment (manual)</option>
                    <option value="REFUND">Refund</option>
                    <option value="ADJUSTMENT">Adjustment</option>
                  </select>
                </label>
                <label className={label}>
                  Note
                  <input name="note" placeholder="Why — e.g. bank transfer #123" required className={input} />
                </label>
              </div>
            </ActionForm>
            <ul className="mt-5 divide-y divide-zinc-100 text-sm">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {REASON[e.reason] ?? e.reason}
                      {e.workspaceId && wsNames.get(e.workspaceId) && a.workspaces.length > 1 && (
                        <span className="font-normal text-zinc-500"> · {wsNames.get(e.workspaceId)}</span>
                      )}
                    </p>
                    {e.note && <p className="truncate text-xs text-zinc-500">{e.note}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`tabular-nums ${e.amount >= 0 ? 'font-medium text-emerald-600' : ''}`}>
                      {e.amount >= 0 ? '+' : ''}
                      {e.amount.toLocaleString()}
                    </p>
                    <p className="text-xs text-zinc-500">{fmtDateTime(e.createdAt)}</p>
                  </div>
                </li>
              ))}
              {entries.length === 0 && <li className="py-3 text-zinc-500">No credit activity.</li>}
            </ul>
          </section>

          {/* Members */}
          <section className={card}>
            <h2 className="font-semibold">Members</h2>
            <ul className="mt-3 divide-y divide-zinc-100 text-sm">
              {a.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <Link href={`/admin/users/${m.user.id}`} className="min-w-0 hover:underline">
                    <span className="font-medium">{m.user.name}</span> <span className="text-zinc-500">· {m.user.email}</span>
                    {m.user.disabledAt && (
                      <>
                        {' '}
                        <Badge tone="red">Blocked</Badge>
                      </>
                    )}
                  </Link>
                  <div className="flex items-center gap-2">
                    <RoleSelect value={m.role} onChange={setMemberRole.bind(null, m.id)} label={`Role of ${m.user.email}`} />
                    <ActionButton action={removeMember.bind(null, m.id)} confirm={`Remove ${m.user.email} from ${a.name}?`} tone="danger">
                      Remove
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
            <ActionForm action={addMember.bind(null, a.id)} submit="Add member" tone="light" className="mt-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <label className={label}>
                  Email of an existing user
                  <input name="email" type="email" required className={input} />
                </label>
                <label className={label}>
                  Role
                  <select name="role" defaultValue="EDITOR" className={input}>
                    <option value="OWNER">Owner</option>
                    <option value="ADMIN">Admin</option>
                    <option value="EDITOR">Editor</option>
                  </select>
                </label>
              </div>
            </ActionForm>
          </section>
        </div>

        <div className="space-y-5">
          {/* Account details */}
          <section className={card}>
            <h2 className="font-semibold">Account</h2>
            <ActionForm action={updateAccount.bind(null, a.id)} submit="Save" className="mt-3 space-y-3">
              <label className={label}>
                Name
                <input name="name" defaultValue={a.name} required className={input} />
              </label>
              <label className={label}>
                Billing email
                <input name="email" type="email" defaultValue={a.email} required className={input} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={label}>
                  Country
                  <input name="country" defaultValue={a.country ?? ''} className={input} />
                </label>
                <label className={label}>
                  Currency
                  <input name="currency" defaultValue={a.currency} maxLength={3} className={input} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className={label}>
                  Plan
                  <select name="plan" defaultValue={a.plan} className={input}>
                    <option value="NONE">No plan</option>
                    <option value="STARTER">Starter</option>
                    <option value="TEAM">Team</option>
                    <option value="AGENCY">Agency</option>
                  </select>
                </label>
                <label className={label}>
                  Billing
                  <select name="billingCycle" defaultValue={a.billingCycle} className={input}>
                    <option value="MONTHLY">Monthly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </label>
              </div>
              <label className={label}>
                Trial ends
                <input name="trialEndsAt" type="date" defaultValue={a.trialEndsAt?.toISOString().slice(0, 10) ?? ''} className={input} />
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" name="alertEmails" defaultChecked={a.alertEmails} /> Email alerts to owners
              </label>
            </ActionForm>
          </section>

          {!a.pausedAt && (
            <section className={card}>
              <h2 className="font-semibold">Pause account</h2>
              <p className="mt-1 text-sm text-zinc-500">Locks members out and stops publishing, syncing and credit spending. Nothing is deleted.</p>
              <ActionForm action={pauseAccount.bind(null, a.id)} submit="Pause account" tone="light" className="mt-3">
                <label className={label}>
                  Reason (shown to admins only)
                  <input name="reason" placeholder="e.g. unpaid invoice" className={input} />
                </label>
              </ActionForm>
            </section>
          )}

          <section className={`${card} ring-red-200`}>
            <h2 className="font-semibold text-red-700">Delete account</h2>
            <p className="mt-1 mb-3 text-sm text-zinc-500">
              Deletes the account, {a.workspaces.length === 1 ? 'its company' : `all ${a.workspaces.length} companies`} with channels, posts, ads data and credit history. Users stay. This can&apos;t be undone.
            </p>
            <ConfirmDelete action={deleteAccount.bind(null, a.id)} expected={a.name} what="account" />
          </section>

          {logs.length > 0 && (
            <section className={card}>
              <h2 className="font-semibold">Admin history</h2>
              <ul className="mt-2 space-y-1.5 text-xs text-zinc-600">
                {logs.map((l) => (
                  <li key={l.id}>
                    <b className="font-medium text-zinc-800">{l.action}</b> · {l.adminEmail} · {fmtDateTime(l.createdAt)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
