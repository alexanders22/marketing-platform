import 'server-only'
import type { BrandKit } from '@prisma/client'
import { prisma } from './prisma'

// How ready a workspace is to work: the setup steps Loudpilot needs (brand,
// channels, website checks, a goal and a plan), each with where to do it.
// The dashboard shows what is left so the owner knows what to do next.
export type StepGroup = 'Brand' | 'Channels' | 'Website' | 'Growth'
export type Step = { key: string; group: StepGroup; label: string; hint: string; href: string; cta: string; done: boolean; weight: number }

const SOCIAL = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'TELEGRAM', 'X', 'THREADS', 'PINTEREST'] as const

export async function readinessOf(workspaceId: string, brand: BrandKit | null) {
  const [profile, brandbook, competitors, accounts, audits, goals, plans] = await Promise.all([
    prisma.brandProfile.count({ where: { workspaceId } }),
    prisma.brandbook.count({ where: { workspaceId } }),
    prisma.competitor.count({ where: { workspaceId } }),
    prisma.socialAccount.groupBy({ by: ['network'], where: { workspaceId, status: 'ACTIVE' } }),
    prisma.websiteAudit.groupBy({ by: ['kind'], where: { workspaceId } }),
    prisma.goal.count({ where: { workspaceId, active: true } }),
    prisma.strategyPlan.count({ where: { workspaceId } }),
  ])
  const networks = new Set<string>(accounts.map((a) => a.network))
  const checked = new Set(audits.map((a) => a.kind))
  const site = Boolean(brand?.website)
  const needSite = 'Add your website in the brand kit first.'

  const steps: Step[] = [
    { key: 'website', group: 'Brand', label: 'Add your website', hint: 'Loudpilot reads it to learn your offer, prices and tone.', href: '/app/brand', cta: 'Add website', done: site, weight: 2 },
    { key: 'kit', group: 'Brand', label: 'Logo and brand colors', hint: 'Every design and video uses them.', href: '/app/brand', cta: 'Open brand kit', done: Boolean(brand?.logoUrl && brand.colors.length), weight: 1 },
    { key: 'about', group: 'Brand', label: 'Describe the business and audience', hint: 'Who you sell to and how you talk — the AI writes in this voice.', href: '/app/brand', cta: 'Describe', done: Boolean(brand?.description && brand.audience), weight: 1 },
    { key: 'dossier', group: 'Brand', label: 'Build the company dossier', hint: 'What works in your posts and ads over the last 12 months.', href: '/app/dossier', cta: 'Build dossier', done: profile > 0, weight: 2 },
    { key: 'brandbook', group: 'Brand', label: 'Upload or create a brandbook', hint: 'The brand rules the AI follows in every post and ad.', href: '/app/brandbook', cta: 'Add brandbook', done: brandbook > 0, weight: 1 },
    { key: 'competitors', group: 'Brand', label: 'Add competitors', hint: 'Two or three rivals — see where you win and what to copy.', href: '/app/competitors', cta: 'Add competitors', done: competitors > 0, weight: 1 },
    { key: 'social', group: 'Channels', label: 'Connect a social account', hint: 'Facebook, Instagram, TikTok, LinkedIn… to publish and measure posts.', href: '/app/channels', cta: 'Connect', done: SOCIAL.some((n) => networks.has(n)), weight: 2 },
    { key: 'ads', group: 'Channels', label: 'Connect Meta Ads', hint: 'Follow spend, leads and cost per result; boost posts.', href: '/app/channels', cta: 'Connect', done: networks.has('META_ADS'), weight: 2 },
    { key: 'ga', group: 'Channels', label: 'Connect Google Analytics', hint: 'See what ads and posts bring to the website.', href: '/app/channels', cta: 'Connect', done: networks.has('GOOGLE_ANALYTICS'), weight: 1 },
    { key: 'seo', group: 'Website', label: 'Run the SEO check', hint: site ? 'What to fix so Google ranks the site higher.' : needSite, href: '/app/website', cta: 'Check SEO', done: checked.has('SEO'), weight: 1 },
    { key: 'geo', group: 'Website', label: 'Check visibility in AI search', hint: site ? 'Whether ChatGPT and other AI answers mention you.' : needSite, href: '/app/website/ai', cta: 'Check', done: checked.has('GEO'), weight: 1 },
    { key: 'tracking', group: 'Website', label: 'Check ad tracking', hint: site ? 'Meta Pixel, Conversions API and Google tags on the site.' : needSite, href: '/app/website/tracking', cta: 'Check tracking', done: checked.has('TRACKING'), weight: 1 },
    { key: 'goal', group: 'Growth', label: 'Set your first goal', hint: 'Loudpilot checks it every hour and alerts you when it slips.', href: '/app/goals', cta: 'Set a goal', done: goals > 0, weight: 1 },
    { key: 'plan', group: 'Growth', label: 'Make a marketing plan', hint: 'Audiences, budget, ads and content for one business goal.', href: '/app/strategy', cta: 'Make a plan', done: plans > 0, weight: 1 },
  ]
  const total = steps.reduce((s, x) => s + x.weight, 0)
  const got = steps.reduce((s, x) => s + (x.done ? x.weight : 0), 0)
  return { steps, percent: Math.round((got / total) * 100), done: steps.filter((s) => s.done).length }
}

export type Readiness = Awaited<ReturnType<typeof readinessOf>>
