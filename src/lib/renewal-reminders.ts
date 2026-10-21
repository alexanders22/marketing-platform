import 'server-only'
import { getPlans } from './credits'
import { terminalUrl } from './hosts'
import { actionEmail, sendMail } from './mail'
import { monremCurrency } from './monrem'
import { yearlyTotal } from './plans'
import { priceLabel } from './pricing'
import { prisma } from './prisma'

// Paid periods don't renew by themselves (Bank of Georgia cards can't be
// charged again), so owners and admins are emailed a few days before the
// period ends and on the day it ends, each once per period. Accounts that
// renew automatically (an active Monrem subscription) get nothing.

const DAY = 86_400_000
// Days before the end: a week's notice for a year, three days for a month.
const NOTICE = { MONTHLY: 3, YEARLY: 7 }
// An ended period is reminded only for a few days, not for ever.
const ENDED_FOR = 3 * DAY

type Stage = 'due' | 'ended'
const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export async function renewalRemindersDue(now = new Date()) {
  const accounts = await prisma.account.findMany({
    where: {
      plan: { not: 'NONE' },
      pausedAt: null,
      paidUntil: { gt: new Date(now.getTime() - ENDED_FOR), lt: new Date(now.getTime() + NOTICE.YEARLY * DAY) },
      subscriptions: { none: { status: 'ACTIVE' } },
    },
    select: { id: true, plan: true, billingCycle: true, paidUntil: true, renewalReminder: true },
  })
  const plans = await getPlans()
  let sent = 0
  for (const a of accounts) {
    const until = a.paidUntil!
    const stage: Stage | null = until <= now ? 'ended' : until.getTime() - now.getTime() <= NOTICE[a.billingCycle] * DAY ? 'due' : null
    if (!stage) continue
    const key = `${stage}:${until.toISOString()}`
    // Once per stage and period; "ended" also covers a "due" never sent.
    const done = stage === 'due' ? [key, `ended:${until.toISOString()}`] : [key]
    const claimed = await prisma.account.updateMany({
      where: { id: a.id, OR: [{ renewalReminder: null }, { renewalReminder: { notIn: done } }] },
      data: { renewalReminder: key },
    })
    if (claimed.count === 0) continue
    const plan = plans.find((p) => p.id === a.plan)
    if (!plan) continue
    const price =
      a.billingCycle === 'YEARLY'
        ? `${priceLabel({ usd: yearlyTotal(plan.monthly), gel: yearlyTotal(plan.monthlyGel) }, monremCurrency())} / year`
        : `${priceLabel({ usd: plan.monthly, gel: plan.monthlyGel }, monremCurrency())} / month`
    const link = `${terminalUrl()}/app/credits?renew=1`
    const [subject, intro] =
      stage === 'due'
        ? [
            `Your Loudpilot ${plan.name} plan ends on ${fmt(until)}`,
            `Your ${plan.name} plan is paid until <b>${fmt(until)}</b>. Renew now to keep publishing, analytics and your ${plan.credits.toLocaleString('en-US')} monthly credits without a break — ${price}.`,
          ]
        : [
            `Your Loudpilot ${plan.name} plan has ended`,
            `Your ${plan.name} plan ended on <b>${fmt(until)}</b>. Paid features are paused until you renew — your posts, channels and credits are kept. ${price}.`,
          ]
    const members = await prisma.accountMember.findMany({ where: { accountId: a.id, role: { in: ['OWNER', 'ADMIN'] } }, select: { user: { select: { email: true } } } })
    for (const m of members) {
      try {
        await sendMail(
          m.user.email,
          subject,
          `${intro.replace(/<\/?b>/g, '')}\n\nRenew: ${link}`,
          actionEmail(intro, 'Renew plan', link, 'You get this because you own or manage this Loudpilot account. Payment is by card through Monrem.'),
        )
        sent++
      } catch (e) {
        console.error('renewal reminder failed', a.id, e instanceof Error ? e.message : e)
      }
    }
  }
  return sent
}
