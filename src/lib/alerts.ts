import 'server-only'
import { createHmac } from 'node:crypto'
import type { Alert, AlertSeverity } from '@prisma/client'
import { appUrl, sendMail } from './mail'
import { prisma } from './prisma'

// Alerts are stored first and delivered by dispatchAlerts() on the next
// tick: an email digest to account owners/admins and, for partner
// workspaces, a signed webhook to the partner.

export type NewAlert = {
  workspaceId: string
  kind: string
  severity: AlertSeverity
  title: string
  body: string
  href?: string
  goalId?: string
  // Same key twice → stored once.
  dedupeKey?: string
}

export async function raiseAlert(a: NewAlert) {
  try {
    return await prisma.alert.create({ data: a })
  } catch (e) {
    // Unique (workspaceId, dedupeKey): already raised.
    if ((e as { code?: string }).code === 'P2002') return null
    throw e
  }
}

// A connected account stopped working (token expired or access removed).
export function accountExpiredAlert(a: { id: string; workspaceId: string; name: string; network: string }, reason: string) {
  return raiseAlert({
    workspaceId: a.workspaceId,
    kind: 'account_disconnected',
    severity: 'CRITICAL',
    title: `Reconnect ${a.name}`,
    body:
      a.network === 'META_ADS'
        ? `Khma lost access to this ad account: ${reason} Ad results, goals and alerts stop updating until it is reconnected.`
        : `Khma lost access to this ${a.network === 'INSTAGRAM' ? 'Instagram account' : 'Facebook Page'}: ${reason} Posts will not publish and results will not update until it is reconnected.`,
    href: '/app/channels',
    dedupeKey: `account:${a.id}:expired:${new Date().toISOString().slice(0, 10)}`,
  })
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const COLOR: Record<AlertSeverity, string> = { CRITICAL: '#dc2626', WARNING: '#d97706', INFO: '#059669' }

function digest(alerts: Alert[]) {
  const items = alerts
    .map(
      (a) => `<tr><td style="padding:12px 0;border-top:1px solid #f4f4f5">
<p style="margin:0;font-size:14px;font-weight:600"><span style="color:${COLOR[a.severity]}">●</span> ${esc(a.title)}</p>
<p style="margin:4px 0 0;font-size:13px;color:#52525b;line-height:1.5">${esc(a.body)}</p>
${a.href ? `<p style="margin:6px 0 0;font-size:13px"><a href="${appUrl()}${a.href}" style="color:#4f46e5">Open in Khma →</a></p>` : ''}
</td></tr>`,
    )
    .join('')
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b">
<p style="font-size:18px;font-weight:600;margin:0 0 4px">Khma</p>
<p style="font-size:15px;margin:0 0 12px">${alerts.length === 1 ? 'One thing needs your attention' : `${alerts.length} things need your attention`}</p>
<table style="width:100%;border-collapse:collapse">${items}</table>
<p style="font-size:12px;color:#a1a1aa;margin:20px 0 0">You get these because alert emails are on for your account. Turn them off on the Alerts page.</p>
</div>`
}

export function signWebhook(secret: string, timestamp: number, body: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

export const alertPayload = (a: Alert) => ({
  id: a.id,
  kind: a.kind,
  severity: a.severity.toLowerCase(),
  title: a.title,
  body: a.body,
  url: a.href ? `${appUrl()}${a.href}` : null,
  createdAt: a.createdAt,
})

// Deliver alerts not yet emailed / sent to the partner.
export async function dispatchAlerts(limit = 200) {
  const pending = await prisma.alert.findMany({
    where: { OR: [{ emailedAt: null }, { webhookAt: null }], createdAt: { gte: new Date(Date.now() - 2 * 86_400_000) } },
    include: {
      workspace: {
        include: {
          partner: true,
          account: { include: { members: { where: { role: { in: ['OWNER', 'ADMIN'] } }, include: { user: { select: { email: true } } } } } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  const byWorkspace = new Map<string, typeof pending>()
  for (const a of pending) byWorkspace.set(a.workspaceId, [...(byWorkspace.get(a.workspaceId) ?? []), a])

  let emailed = 0
  let hooked = 0
  for (const list of byWorkspace.values()) {
    const ws = list[0].workspace

    const toEmail = list.filter((a) => !a.emailedAt)
    if (toEmail.length) {
      const recipients = ws.account?.alertEmails ? [...new Set(ws.account.members.map((m) => m.user.email))] : []
      try {
        const subject =
          toEmail.length === 1 ? `Khma alert: ${toEmail[0].title}` : `Khma: ${toEmail.length} alerts for ${ws.name}`
        const text = toEmail.map((a) => `• ${a.title}\n  ${a.body}${a.href ? `\n  ${appUrl()}${a.href}` : ''}`).join('\n\n')
        for (const to of recipients) await sendMail(to, subject, text, digest(toEmail))
        await prisma.alert.updateMany({ where: { id: { in: toEmail.map((a) => a.id) } }, data: { emailedAt: new Date() } })
        emailed += recipients.length ? toEmail.length : 0
      } catch (e) {
        console.error('alert email failed', ws.id, e instanceof Error ? e.message : e)
      }
    }

    const toHook = list.filter((a) => !a.webhookAt)
    if (toHook.length) {
      const p = ws.partner
      if (p?.webhookUrl && p.webhookSecret && ws.externalId) {
        for (const a of toHook) {
          const body = JSON.stringify({ type: 'alert.created', workspace: { externalId: ws.externalId }, alert: alertPayload(a) })
          const ts = Math.floor(Date.now() / 1000)
          try {
            const res = await fetch(p.webhookUrl, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-khma-timestamp': String(ts),
                'x-khma-signature': `sha256=${signWebhook(p.webhookSecret, ts, body)}`,
              },
              body,
              signal: AbortSignal.timeout(10_000),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            await prisma.alert.update({ where: { id: a.id }, data: { webhookAt: new Date() } })
            hooked++
          } catch (e) {
            // Retried on the next ticks for two days.
            console.error('alert webhook failed', p.slug, e instanceof Error ? e.message : e)
          }
        }
      } else {
        // Nobody to call: mark as handled.
        await prisma.alert.updateMany({ where: { id: { in: toHook.map((a) => a.id) } }, data: { webhookAt: new Date() } })
      }
    }
  }
  return { emailed, hooked }
}
