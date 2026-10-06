import { expect, test } from '@playwright/test'
import { BUNDLES, PLANS } from '../../src/lib/plans'
import { DEFAULT_PRICING } from '../../src/lib/pricing'

// What the pricing promises each month must fit in the plan's credits at the
// default prices — Veo seconds on the cheapest quality, with room to spare
// for suggestions, summaries and reply drafts.
test('every plan bundle fits in its monthly credits', () => {
  const a = DEFAULT_PRICING.actions
  for (const p of PLANS) {
    const b = BUNDLES[p.id]
    const used =
      b.posts * a.postText.credits +
      b.images * a.image.credits +
      b.videos * (a.videoScript.credits + a.voice.credits) +
      b.articles * a.blogArticle.credits +
      b.strategies * a.strategy.credits +
      DEFAULT_PRICING.veoSecondsPerMonth[p.id] * a.clipQuick.credits
    expect(used, p.id).toBeLessThanOrEqual(p.credits * 0.95)
  }
})
