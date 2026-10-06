// Goal metrics, shared by the goal form (client) and the evaluator (server).

export type GoalScopeId = 'CAMPAIGN' | 'ADS' | 'POSTS' | 'WEBSITE'
export type MetricKind = 'money' | 'count' | 'percent'

export type MetricDef = {
  id: string
  label: string
  kind: MetricKind
  // Sensible direction: costs should stay low, everything else high.
  atMost: boolean
  scopes: GoalScopeId[]
  hint: string
}

export const METRICS: MetricDef[] = [
  // Ads
  { id: 'cost_per_result', label: 'Cost per result', kind: 'money', atMost: true, scopes: ['CAMPAIGN', 'ADS'], hint: 'Cost per lead, purchase or click — whatever the campaign is optimised for.' },
  { id: 'results', label: 'Results', kind: 'count', atMost: false, scopes: ['CAMPAIGN', 'ADS'], hint: 'Leads, purchases, clicks … in the window.' },
  { id: 'spend', label: 'Spend', kind: 'money', atMost: true, scopes: ['CAMPAIGN', 'ADS'], hint: 'Money spent in the window.' },
  { id: 'ctr', label: 'Click-through rate', kind: 'percent', atMost: false, scopes: ['CAMPAIGN', 'ADS'], hint: 'Clicks ÷ impressions.' },
  { id: 'cpm', label: 'Cost per 1,000 impressions', kind: 'money', atMost: true, scopes: ['CAMPAIGN', 'ADS'], hint: 'CPM — rises when the audience gets expensive or saturated.' },
  { id: 'ad_impressions', label: 'Impressions', kind: 'count', atMost: false, scopes: ['CAMPAIGN', 'ADS'], hint: 'How many times the ads were shown.' },
  { id: 'ad_reach', label: 'Reach', kind: 'count', atMost: false, scopes: ['CAMPAIGN', 'ADS'], hint: 'People reached (sum of daily reach).' },
  { id: 'roas', label: 'Return on ad spend', kind: 'count', atMost: false, scopes: ['CAMPAIGN', 'ADS'], hint: 'Purchase value ÷ spend (needs purchase tracking).' },
  // Posts
  { id: 'posts', label: 'Posts published', kind: 'count', atMost: false, scopes: ['POSTS'], hint: 'How often you post.' },
  { id: 'reach', label: 'Total reach', kind: 'count', atMost: false, scopes: ['POSTS'], hint: 'Reach of all posts in the window.' },
  { id: 'avg_reach', label: 'Average reach per post', kind: 'count', atMost: false, scopes: ['POSTS'], hint: 'Reach ÷ posts.' },
  { id: 'views', label: 'Total views', kind: 'count', atMost: false, scopes: ['POSTS'], hint: 'Times your posts were seen or played.' },
  { id: 'avg_views', label: 'Average views per post', kind: 'count', atMost: false, scopes: ['POSTS'], hint: 'Views ÷ posts.' },
  { id: 'likes', label: 'Likes', kind: 'count', atMost: false, scopes: ['POSTS'], hint: 'Likes and reactions.' },
  { id: 'comments', label: 'Comments', kind: 'count', atMost: false, scopes: ['POSTS'], hint: 'Comments on your posts.' },
  { id: 'shares', label: 'Shares', kind: 'count', atMost: false, scopes: ['POSTS'], hint: 'Shares and reposts.' },
  { id: 'saves', label: 'Saves', kind: 'count', atMost: false, scopes: ['POSTS'], hint: 'Instagram saves.' },
  { id: 'engagements', label: 'Engagements', kind: 'count', atMost: false, scopes: ['POSTS'], hint: 'Likes + comments + shares + saves.' },
  { id: 'avg_engagements', label: 'Average engagements per post', kind: 'count', atMost: false, scopes: ['POSTS'], hint: 'Engagements ÷ posts.' },
  { id: 'engagement_rate', label: 'Engagement rate', kind: 'percent', atMost: false, scopes: ['POSTS'], hint: 'Engagements ÷ reach.' },
  // Website (Google Analytics)
  { id: 'site_key_events', label: 'Key events (sign-ups, leads, sales)', kind: 'count', atMost: false, scopes: ['WEBSITE'], hint: 'All key events, or one of them (e.g. sign_up).' },
  { id: 'site_cost_per_key_event', label: 'Ad cost per key event', kind: 'money', atMost: true, scopes: ['WEBSITE'], hint: 'Meta ad spend ÷ key events — what one sign-up or lead costs.' },
  { id: 'site_visits', label: 'Website visits', kind: 'count', atMost: false, scopes: ['WEBSITE'], hint: 'Sessions on the website.' },
  { id: 'site_new_users', label: 'New visitors', kind: 'count', atMost: false, scopes: ['WEBSITE'], hint: 'People visiting for the first time.' },
  { id: 'site_conversion_rate', label: 'Conversion rate', kind: 'percent', atMost: false, scopes: ['WEBSITE'], hint: 'Key events ÷ visits.' },
]

export const metricDef = (id: string) => METRICS.find((m) => m.id === id)

export const WINDOWS = [
  { days: 1, label: 'Yesterday' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
] as const

// Within this share of the target on the wrong side: "at risk", beyond it:
// "off track".
export const RISK_BAND = 0.15

export function classify(actual: number, target: number, atMost: boolean): 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' {
  if (atMost) {
    if (actual <= target) return 'ON_TRACK'
    return actual <= target * (1 + RISK_BAND) ? 'AT_RISK' : 'OFF_TRACK'
  }
  if (actual >= target) return 'ON_TRACK'
  return actual >= target * (1 - RISK_BAND) ? 'AT_RISK' : 'OFF_TRACK'
}

export function formatMetric(v: number, kind: MetricKind, currency?: string | null) {
  if (kind === 'percent') return `${(v * 100).toFixed(2)}%`
  if (kind === 'money') {
    if (!currency) return v.toFixed(2)
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(v)
    } catch {
      return `${v.toFixed(2)} ${currency}`
    }
  }
  return v >= 100 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 10) / 10)
}
