import 'server-only'
import { terminalUrl } from './hosts'
import { actionEmail, sendMail } from './mail'
import { PLANS } from './plans'
import { prisma } from './prisma'

// Emails the people running Loudpilot when a customer signs up or pays:
// every super admin, plus KHMA_ADMIN_EMAILS (comma-separated). One email to
// all of them. Never fails or slows the customer's request — a mail error is
// only logged.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

async function recipients() {
  const admins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', disabledAt: null }, select: { email: true } })
  const extra = (process.env.KHMA_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase())
  return [...new Set([...admins.map((a) => a.email.toLowerCase()), ...extra].filter((e) => e.includes('@')))]
}

// `lines` are plain text (customer input is escaped for the HTML part);
// `path` is the admin page the button opens.
export function notifyAdmins(subject: string, lines: string[], path: string) {
  void (async () => {
    const to = await recipients()
    if (to.length === 0) return
    const link = `${terminalUrl()}${path}`
    await sendMail(
      to.join(', '),
      subject,
      `${lines.join('\n')}\n\n${link}`,
      actionEmail(lines.map(esc).join('<br>'), 'Open in admin', link, 'You get this because you are a Loudpilot admin.'),
    )
  })().catch((e) => console.error('admin notification failed', subject, e instanceof Error ? e.message : e))
}

const money = (cents: number, currency: string) => (currency === 'GEL' ? `₾${(cents / 100).toFixed(2)}` : `$${(cents / 100).toFixed(2)}`)

// A card payment that was just fulfilled: a plan period or a credit pack.
export async function notifyPayment(p: { accountId: string; kind: string; plan: string | null; cycle: string | null; credits: number | null; amount: number; currency: string; subscriptionId: string | null }) {
  const a = await prisma.account.findUnique({ where: { id: p.accountId }, select: { name: true, email: true } })
  const who = a ? `${a.name} (${a.email})` : p.accountId
  const paid = money(p.amount, p.currency)
  if (p.kind === 'PACK') {
    notifyAdmins(`Credits bought: ${a?.name ?? 'a customer'} · ${p.credits?.toLocaleString('en-US')} credits · ${paid}`, [`${who} bought ${p.credits?.toLocaleString('en-US')} credits for ${paid} (VAT included).`], `/admin/companies/${p.accountId}`)
    return
  }
  const plan = PLANS.find((x) => x.id === p.plan)?.name ?? p.plan ?? 'a plan'
  const period = p.cycle === 'YEARLY' ? '1 year' : '1 month'
  notifyAdmins(
    `${p.subscriptionId ? 'Plan renewed' : 'Plan paid'}: ${a?.name ?? 'a customer'} · ${plan} · ${paid}`,
    [`${who} paid ${paid} (VAT included) for ${plan}, ${period}${p.subscriptionId ? ' — an automatic renewal' : ''}.`],
    `/admin/companies/${p.accountId}`,
  )
}
