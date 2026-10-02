import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'

// SMTP_URL, e.g. smtp://user:pass@host:587. In development MAIL_DEV_LOG=1
// turns on email flows without a server: messages are printed to the log.
export function mailEnabled() {
  return Boolean(process.env.SMTP_URL) || (process.env.NODE_ENV !== 'production' && process.env.MAIL_DEV_LOG === '1')
}

export function appUrl() {
  return (process.env.APP_URL ?? 'http://localhost:3100').replace(/\/$/, '')
}

let transport: Transporter | null = null

export async function sendMail(to: string, subject: string, text: string, html: string) {
  if (!process.env.SMTP_URL) {
    console.log(`\n[mail] to=${to} subject="${subject}"\n${text}\n`)
    return
  }
  transport ??= nodemailer.createTransport(process.env.SMTP_URL)
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? 'Khma <no-reply@khma.brandrepublic.ge>',
    to,
    subject,
    text,
    html,
  })
}
