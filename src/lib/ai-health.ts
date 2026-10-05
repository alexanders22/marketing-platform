import 'server-only'
import { appUrl, sendMail } from './mail'
import { prisma } from './prisma'

// When the AI provider itself refuses (billing, quota, key), nothing the
// customer does will help: say so plainly, and tell the super admins once
// in a while instead of letting everyone retry.

export const AI_UNAVAILABLE = 'AI is temporarily unavailable on our side. We have been notified and are fixing it — no credits were taken.'

const text = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function isProviderDown(e: unknown) {
  const status = (e as { status?: number })?.status ?? 0
  const m = text(e).toLowerCase()
  return (
    [401, 402, 403].includes(status) ||
    m.includes('prepayment credits are depleted') ||
    m.includes('billing') ||
    m.includes('api key not valid') ||
    m.includes('api_key_invalid')
  )
}

const EVERY_MS = 3 * 60 * 60 * 1000
let lastNotice = 0

export function noteAiFailure(e: unknown) {
  if (!isProviderDown(e) || Date.now() - lastNotice < EVERY_MS) return
  lastNotice = Date.now()
  const detail = text(e).slice(0, 600)
  console.error('AI provider unavailable:', detail)
  void (async () => {
    const admins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', disabledAt: null }, select: { email: true } })
    for (const a of admins) {
      await sendMail(
        a.email,
        'Loudpilot: AI provider is refusing requests',
        `Gemini refused a request — customers can't use AI until this is fixed.\n\n${detail}\n\nCheck billing at https://aistudio.google.com/ (API keys → project billing).\n${appUrl()}`,
        `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#18181b"><p style="font-size:16px;font-weight:600">Gemini is refusing requests</p><p>Customers can't use AI (posts, suggestions, images, voice, video) until this is fixed.</p><pre style="white-space:pre-wrap;background:#f4f4f5;padding:12px;border-radius:8px;font-size:12px">${detail.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`)}</pre><p>Check billing in <a href="https://aistudio.google.com/">Google AI Studio</a>.</p></div>`,
      ).catch((err) => console.error('AI notice mail failed', err))
    }
  })().catch((err) => console.error('AI notice failed', err))
}

// The message for a failed AI action: the plain "unavailable" one when the
// provider is down, else the action's own.
export function aiError(e: unknown, fallback: string) {
  noteAiFailure(e)
  return isProviderDown(e) ? AI_UNAVAILABLE : fallback
}
