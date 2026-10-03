import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'

// Same settings as Upla:
//   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM — any SMTP relay
//     (locally mailpit on localhost:1025).
//   SENDGRID_API_KEY / SENDGRID_FROM — used when no SMTP_HOST is set.
// An explicit SMTP host wins so a stale SendGrid key can't override it.
export function mailEnabled() {
  return Boolean(process.env.SMTP_HOST || process.env.SENDGRID_API_KEY)
}

export function appUrl() {
  return (process.env.APP_URL ?? 'http://localhost:3100').replace(/\/$/, '')
}

// Fail fast instead of hanging the request when the relay is unreachable.
const TIMEOUTS = { connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 }

function createTransport(): Transporter {
  const host = process.env.SMTP_HOST
  if (host) {
    const local = host === 'localhost' || host === '127.0.0.1'
    return nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      // The MTA on the same box (exim, mailpit) presents a certificate for its
      // public hostname, not "localhost" — skip STARTTLS on loopback.
      ignoreTLS: local,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      ...TIMEOUTS,
    })
  }
  return nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
    ...TIMEOUTS,
  })
}

let transport: Transporter | null = null

export async function sendMail(to: string, subject: string, text: string, html: string) {
  if (!mailEnabled()) {
    console.log(`\n[mail disabled] to=${to} subject="${subject}"\n${text}\n`)
    return
  }
  transport ??= createTransport()
  await transport.sendMail({
    // The sender must be verified with the provider (SendGrid single sender).
    from:
      process.env.SMTP_FROM ||
      (process.env.SENDGRID_FROM ? `Loudpilot <${process.env.SENDGRID_FROM}>` : 'Loudpilot <no-reply@loudpilot.local>'),
    to,
    subject,
    text,
    html,
  })
}

// Shared look for transactional emails: one message, one button.
export function actionEmail(intro: string, button: string, link: string, footer: string) {
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#18181b">
<p style="font-size:18px;font-weight:600;margin:0 0 12px">Loudpilot</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">${intro}</p>
<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;padding:11px 20px;background:#18181b;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${button}</a></p>
<p style="font-size:13px;color:#71717a;line-height:1.5;margin:0">${footer}</p>
</div>`
}
