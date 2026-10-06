// Local demo data for design work: a "Bloom Bakery (demo)" company with 60
// days of ads, website, posts, goals with history and a weekly review.
// Usage: npx tsx --conditions=react-server scripts/seed-demo.ts <user email> [workspace id to sit next to]
// Never run against production.
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { weekFacts } from '../src/lib/weekly'

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
const wave = (i: number, base: number, amp: number, seed = 1) => Math.max(0, Math.round(base + amp * Math.sin((i + seed) / 4) + amp * 0.4 * Math.cos((i * seed) / 7)))

async function main() {
  if (process.env.NODE_ENV === 'production' || /loudpilot\.app/.test(process.env.APP_URL ?? '')) throw new Error('Not on production')
  const email = process.argv[2]
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  // Optionally next to a given company (its account), else the user's first account.
  const near = process.argv[3] ? await prisma.workspace.findUniqueOrThrow({ where: { id: process.argv[3] } }) : null
  const member = await prisma.accountMember.findFirstOrThrow({ where: { userId: user.id, ...(near?.accountId ? { accountId: near.accountId } : {}) } })
  const name = 'Bloom Bakery (demo)'
  await prisma.workspace.deleteMany({ where: { accountId: member.accountId, name } })
  const ws = await prisma.workspace.create({
    data: { accountId: member.accountId, name, brandKit: { create: { website: 'https://bloom.example', description: 'A bakery in Tbilisi: bread, pastries and cakes to order.' } } },
  })
  const far = new Date(Date.now() + 30 * 86_400_000)
  const acc = (network: 'FACEBOOK' | 'INSTAGRAM' | 'META_ADS' | 'GOOGLE_ANALYTICS', externalId: string, n: string, meta?: object) =>
    prisma.socialAccount.create({ data: { workspaceId: ws.id, network, externalId, name: n, meta, syncedAt: far, historyAt: far, inboxSyncedAt: far, scopes: ['ads_management'] } })
  const fb = await acc('FACEBOOK', 'demo-page', 'Bloom Bakery')
  const ig = await acc('INSTAGRAM', 'demo-ig', 'Bloom Bakery')
  const ads = await acc('META_ADS', 'act_demo', 'Bloom Ads', { currency: 'GEL', timeZone: 'Asia/Tbilisi' })
  const ga = await acc('GOOGLE_ANALYTICS', 'properties/demo', 'bloom.example')

  // Ads: three campaigns, 60 days.
  const campaigns = [
    { name: 'Lead Gen — Cakes to order', objective: 'OUTCOME_LEADS', status: 'ACTIVE', daily: 35, type: 'lead', perDay: 9, seed: 1 },
    { name: 'Weekend traffic', objective: 'OUTCOME_TRAFFIC', status: 'ACTIVE', daily: 20, type: 'link_click', perDay: 70, seed: 3 },
    { name: 'Autumn awareness', objective: 'OUTCOME_AWARENESS', status: 'PAUSED', daily: 15, type: 'reach', perDay: 4000, seed: 5 },
  ]
  for (const c of campaigns) {
    const row = await prisma.adCampaign.create({
      data: { workspaceId: ws.id, socialAccountId: ads.id, externalId: `demo-${c.seed}`, name: c.name, objective: c.objective, status: c.status, dailyBudget: c.daily, currency: 'GEL', startsAt: new Date(Date.now() - 70 * 86_400_000) },
    })
    for (let i = 59; i >= 0; i--) {
      if (c.status === 'PAUSED' && i < 12) continue
      const spend = Math.max(4, c.daily + Math.sin((i + c.seed) / 3) * c.daily * 0.25)
      const results = wave(59 - i, c.perDay * (1 + (59 - i) / 120), c.perDay * 0.35, c.seed)
      const impressions = Math.round(spend * 230)
      await prisma.adInsightDay.create({
        data: { campaignId: row.id, date: day(i), spend: +spend.toFixed(2), impressions, reach: Math.round(impressions * 0.7), clicks: Math.round(impressions * 0.018), results, resultType: c.type },
      })
    }
  }

  // Website: visits, key events and channels.
  for (let i = 59; i >= 0; i--) {
    const sessions = wave(59 - i, 820 + (59 - i) * 4, 160, 2)
    const keyEvents = Math.round(sessions * 0.028)
    await prisma.websiteDay.create({
      data: {
        workspaceId: ws.id,
        accountId: ga.id,
        date: day(i),
        sessions,
        users: Math.round(sessions * 0.8),
        newUsers: Math.round(sessions * 0.55),
        engaged: Math.round(sessions * 0.6),
        keyEvents,
        revenue: 0,
        events: { generate_lead: Math.round(keyEvents * 0.6), sign_up: keyEvents - Math.round(keyEvents * 0.6) },
        channels: [
          { channel: 'Paid Social', sessions: Math.round(sessions * 0.38), keyEvents: Math.round(keyEvents * 0.45) },
          { channel: 'Organic Search', sessions: Math.round(sessions * 0.27), keyEvents: Math.round(keyEvents * 0.25) },
          { channel: 'Direct', sessions: Math.round(sessions * 0.17), keyEvents: Math.round(keyEvents * 0.15) },
          { channel: 'Organic Social', sessions: Math.round(sessions * 0.1), keyEvents: Math.round(keyEvents * 0.1) },
          { channel: 'Referral', sessions: Math.round(sessions * 0.05), keyEvents: Math.round(keyEvents * 0.05) },
          { channel: 'Email', sessions: Math.round(sessions * 0.03), keyEvents: 0 },
        ],
        campaigns: [],
      },
    })
  }

  // Posts: about three a week, with numbers.
  const captions = ['Fresh sourdough just out of the oven', 'Birthday cake of the week: pistachio & raspberry', 'Behind the scenes at 5am', 'Croissant Saturday — 2 for 1 until noon', 'Meet our pastry chef Nino', 'New: gluten-free rye', 'Autumn menu is here', 'Your cake, your design — order 48h ahead']
  for (let k = 0; k < 24; k++) {
    const ago = 2 + Math.round(k * 2.4)
    const at = new Date(Date.now() - ago * 86_400_000)
    const post = await prisma.post.create({
      data: { workspaceId: ws.id, kind: 'SOCIAL', status: 'PUBLISHED', content: captions[k % captions.length], hashtags: ['bloombakery'], mediaIds: [], channels: ['FACEBOOK', 'INSTAGRAM'], publishedAt: at, scheduledAt: at },
    })
    for (const a of [fb, ig]) {
      const reach = 600 + ((k * 397) % 1900) + (a === ig ? 400 : 0)
      const likes = Math.round(reach * 0.045)
      await prisma.postDelivery.create({
        data: { postId: post.id, socialAccountId: a.id, status: 'PUBLISHED', externalId: `demo-${a.network}-${k}`, metrics: { reach, views: Math.round(reach * 1.4), likes, comments: Math.round(likes / 8), shares: Math.round(likes / 12), saves: Math.round(likes / 10), interactions: Math.round(likes * 1.3) }, metricsAt: new Date(), createdAt: at },
      })
    }
  }

  // Goals with 14+ days of history.
  const lead = await prisma.adCampaign.findFirstOrThrow({ where: { workspaceId: ws.id, name: { startsWith: 'Lead Gen' } } })
  const goals = [
    { scope: 'CAMPAIGN' as const, adCampaignId: lead.id, metric: 'cost_per_result', atMost: true, target: 4.5, actual: 3.9, status: 'ON_TRACK' as const, pattern: 'GGGGGAGGGGGGGG' },
    { scope: 'POSTS' as const, metric: 'posts', atMost: false, target: 3, actual: 3, status: 'ON_TRACK' as const, pattern: 'GGGAAGGGGGGGGG' },
    { scope: 'WEBSITE' as const, metric: 'site_key_events', atMost: false, target: 800, actual: 712, status: 'AT_RISK' as const, pattern: 'GGGGGGGGGGAAAA', window: 30 },
    { scope: 'POSTS' as const, network: 'INSTAGRAM', metric: 'avg_reach', atMost: false, target: 2000, actual: 1640, status: 'OFF_TRACK' as const, pattern: 'AAROOOAAROOOOO', window: 30 },
    { scope: 'ADS' as const, metric: 'ctr', atMost: false, target: 0.015, actual: 0.018, status: 'ON_TRACK' as const, pattern: '....GGGGGGGGGG' },
  ]
  const S = { G: 'ON_TRACK', A: 'AT_RISK', O: 'OFF_TRACK', R: 'AT_RISK' } as const
  for (const g of goals) {
    const row = await prisma.goal.create({
      data: { workspaceId: ws.id, scope: g.scope, adCampaignId: g.adCampaignId ?? null, network: g.network ?? null, metric: g.metric, atMost: g.atMost, target: g.target, actual: g.actual, status: g.status, windowDays: g.window ?? 7, checkedAt: new Date() },
    })
    // Older history: on track most days, for the best streak and XP.
    for (let i = 40; i >= 0; i--) {
      const ch = i < 14 ? g.pattern[13 - i] : i % 9 === 0 ? 'A' : 'G'
      if (ch === '.') continue
      await prisma.goalDay.create({ data: { goalId: row.id, date: day(i), status: S[ch as keyof typeof S], actual: g.actual } })
    }
  }

  // A weekly review with recommendations, two already applied.
  const facts = await weekFacts(ws.id, day(8), day(2), 'Asia/Tbilisi')
  const review = await prisma.weeklyReview.create({
    data: {
      workspaceId: ws.id,
      weekStart: day(8),
      weekEnd: day(2),
      stats: facts as object,
      data: {
        headline: 'Leads got cheaper while Instagram reach dipped — double down on cake posts.',
        summary:
          'Cost per lead fell to ₾3.90 (from ₾4.60) as the cakes campaign kept 9–12 leads a day. Website key events grew 12%, two thirds from paid social. Instagram reach per post slipped below 1,700: carousels did twice as well as single photos.',
        wins: [
          { text: 'Cheapest leads in two months', evidence: 'Cost per lead ₾3.90 vs ₾4.60 the week before' },
          { text: 'Website sign-ups up 12%', evidence: '186 key events vs 166' },
        ],
        issues: [
          { text: 'Instagram reach per post is under target', evidence: '1,640 average vs the 2,000 goal' },
          { text: '“Autumn awareness” stopped spending', evidence: 'Paused 12 days ago with budget left' },
        ],
      },
      recommendations: {
        create: [
          { workspaceId: ws.id, kind: 'repeat', impact: 'high', title: 'Repeat the pistachio cake carousel on Thursday 19:00', why: 'It reached 2.4× the average post and drove 31 profile visits.', payload: { post: { date: day(-2), time: '19:00', network: 'INSTAGRAM', format: 'Carousel', caption: 'Pistachio & raspberry — order yours 48h ahead 🎂', hashtags: ['bloombakery', 'tbilisi'], visual: '4 close-ups, cut slice last' } } },
          { workspaceId: ws.id, kind: 'budget', impact: 'high', title: 'Move ₾10/day to “Lead Gen — Cakes to order”', why: 'It brings leads at ₾3.90, 40% cheaper than the traffic campaign’s sign-ups.', payload: { campaign: 'Lead Gen — Cakes to order', amountPerDay: 10, steps: ['Raise the daily budget from ₾35 to ₾45', 'Keep the audience as is for 7 days'] } },
          { workspaceId: ws.id, kind: 'creative', impact: 'medium', title: 'New creative for “Weekend traffic”', why: 'Its CTR fell 18% in two weeks — the audience has seen the ad too often.', payload: { campaign: 'Weekend traffic', creative: { headline: 'Warm croissants, Saturday 8am', primaryText: 'Two for one until noon — only at Bloom.', visual: 'Croissant tray in morning light' } } },
          { workspaceId: ws.id, kind: 'goal', impact: 'low', title: 'Watch engagement rate (at least 4%)', why: 'Engagement is 4.6% — a goal keeps it from slipping unnoticed.', payload: { goal: { scope: 'POSTS', metric: 'engagement_rate', target: 4, windowDays: 30 } }, status: 'APPLIED', decidedAt: new Date() },
          { workspaceId: ws.id, kind: 'post', impact: 'medium', title: 'Post a 15-second “5am” reel', why: 'Behind-the-scenes posts get 3× the saves.', payload: { post: { date: day(-3), time: '08:00', network: 'INSTAGRAM', format: 'Reel', caption: 'Our day starts at 5am ☕', hashtags: ['bloombakery'], visual: 'Dough, oven, first loaf' } }, status: 'APPLIED', decidedAt: new Date() },
        ],
      },
    },
  })
  console.log(`Seeded ${ws.name} (${ws.id}), review ${review.id}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
