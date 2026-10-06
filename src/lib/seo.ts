import 'server-only'
import { prisma } from './prisma'
import { safeFetchText } from './safe-fetch'
import { searchData, type ScRow, type ScTotals } from './search-console'
import type { Check } from './tracking'

// SEO check: a technical read of the home page and the pages that get the
// most search traffic, robots.txt and sitemap, plus Search Console data
// (queries, positions, click-through) with the opportunities in it. A score
// out of 100 and a fix for each finding; the AI advice is added on request.

export type PageAudit = {
  url: string
  ok: boolean
  error?: string
  ms: number
  kb: number
  title: string | null
  description: string | null
  h1: number
  images: number
  imagesNoAlt: number
  canonical: string | null
  lang: string | null
  viewport: boolean
  og: boolean
  schema: string[]
  noindex: boolean
  words: number
}

export type SeoAdvice = { summary: string; actions: { title: string; why: string; how: string; impact: 'high' | 'medium' | 'low' }[]; language: string; createdAt: string }

export type SeoReport = {
  url: string | null
  score: number
  pages: PageAudit[]
  site: { https: boolean; robots: 'ok' | 'missing' | 'blocks'; sitemap: boolean }
  checks: Check[]
  search: { site: string; from: string; to: string; totals: ScTotals; previous: ScTotals; queries: ScRow[]; pages: ScRow[]; striking: ScRow[]; lowCtr: ScRow[] } | null
  searchError?: string
  advice?: SeoAdvice
}

const text = (s: string | undefined | null) => (s ?? '').replace(/\s+/g, ' ').trim()
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))?.slice(1).find((x) => x !== undefined) ?? null
const metaContent = (html: string, re: RegExp) => {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) if (re.test(m[0])) return attr(m[0], 'content')
  return null
}

export function auditHtml(url: string, html: string, ms: number): PageAudit {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
  const schema: string[] = []
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1])
      for (const x of [j, ...(Array.isArray(j?.['@graph']) ? j['@graph'] : [])].flat()) if (x?.['@type']) schema.push(...[x['@type']].flat().map(String))
    } catch {
      schema.push('invalid')
    }
  }
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => /rel\s*=\s*["']?canonical/i.test(t))
  return {
    url,
    ok: true,
    ms,
    kb: Math.round(Buffer.byteLength(html) / 1024),
    title: text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || null,
    description: text(metaContent(html, /name\s*=\s*["']?description/i)) || null,
    h1: (html.match(/<h1\b/gi) ?? []).length,
    images: imgs.length,
    imagesNoAlt: imgs.filter((t) => !text(attr(t, 'alt'))).length,
    canonical: canonical ? attr(canonical, 'href') : null,
    lang: attr(html.match(/<html\b[^>]*>/i)?.[0] ?? '', 'lang'),
    viewport: /<meta[^>]+name\s*=\s*["']?viewport/i.test(html),
    og: /<meta[^>]+property\s*=\s*["']?og:title/i.test(html) && /<meta[^>]+property\s*=\s*["']?og:image/i.test(html),
    schema: [...new Set(schema)],
    noindex: /noindex/i.test(metaContent(html, /name\s*=\s*["']?robots/i) ?? ''),
    words: text(body.replace(/<[^>]+>/g, ' ')).split(' ').filter((w) => w.length > 1).length,
  }
}

export async function auditPage(url: string): Promise<{ page: PageAudit; html: string }> {
  const t = Date.now()
  try {
    const r = await safeFetchText(url, { timeoutMs: 12_000, maxBytes: 3_000_000 })
    return { page: auditHtml(r.url, r.text, Date.now() - t), html: r.text }
  } catch (e) {
    const empty = { title: null, description: null, h1: 0, images: 0, imagesNoAlt: 0, canonical: null, lang: null, viewport: false, og: false, schema: [], noindex: false, words: 0 }
    return { page: { url, ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t, kb: 0, ...empty }, html: '' }
  }
}

// Does robots.txt shut this crawler out of the whole site? Its own group
// counts if there is one, else the "*" group.
export function robotsBlocks(txt: string, agent: string) {
  const groups: { agents: string[]; disallowAll: boolean; allowAll: boolean }[] = []
  let g: (typeof groups)[number] | null = null
  let inRules = false
  for (const raw of txt.split(/\r?\n/)) {
    const m = raw.replace(/#.*/, '').trim().match(/^([a-z-]+)\s*:\s*(.*)$/i)
    if (!m) continue
    const [key, value] = [m[1].toLowerCase(), m[2].trim()]
    if (key === 'user-agent') {
      if (!g || inRules) groups.push((g = { agents: [], disallowAll: false, allowAll: false }))
      inRules = false
      g.agents.push(value.toLowerCase())
    } else if (g) {
      inRules = true
      if (key === 'disallow' && value === '/') g.disallowAll = true
      if (key === 'allow' && value === '/') g.allowAll = true
    }
  }
  const mine = groups.find((x) => x.agents.includes(agent.toLowerCase())) ?? groups.find((x) => x.agents.includes('*'))
  return !!mine && mine.disallowAll && !mine.allowAll
}
export const robotsBlocksAll = (txt: string) => robotsBlocks(txt, '*')

// Same-site links from the home page, for sites without Search Console.
function internalLinks(html: string, base: string) {
  const origin = new URL(base).origin
  const out: string[] = []
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base)
      if (u.origin === origin && !/\.(pdf|jpe?g|png|webp|zip)$/i.test(u.pathname) && u.pathname !== '/' && !out.includes(u.href)) out.push(u.href)
    } catch {}
  }
  return out
}

async function robotsAndSitemap(origin: string) {
  let robots: SeoReport['site']['robots'] = 'missing'
  let sitemapUrl = `${origin}/sitemap.xml`
  try {
    const r = await safeFetchText(`${origin}/robots.txt`, { timeoutMs: 6000, maxBytes: 200_000, accept: 'text/plain' })
    if (/user-agent/i.test(r.text)) {
      robots = robotsBlocksAll(r.text) ? 'blocks' : 'ok'
      sitemapUrl = r.text.match(/^sitemap:\s*(\S+)/im)?.[1] ?? sitemapUrl
    }
  } catch {}
  let sitemap = false
  try {
    const s = await safeFetchText(sitemapUrl, { timeoutMs: 6000, maxBytes: 5_000_000, accept: 'application/xml,text/xml' })
    sitemap = /<(urlset|sitemapindex)\b/i.test(s.text)
  } catch {}
  return { robots, sitemap }
}

// "a", "a and b", "a, b and c", "a, b, c and 2 more".
const list = (xs: string[], n = 3) =>
  xs.length > n ? `${xs.slice(0, n).join(', ')} and ${xs.length - n} more` : xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] ?? '')
const path = (u: string) => {
  try {
    return new URL(u).pathname || '/'
  } catch {
    return u
  }
}

// Findings and the score: each issue costs points by how much it matters.
export function judgeSeo(pages: PageAudit[], site: SeoReport['site'], search: SeoReport['search']) {
  const checks: Check[] = []
  let score = 100
  const add = (c: Check, cost: number) => {
    checks.push(c)
    if (c.status === 'bad') score -= cost
    else if (c.status === 'warn') score -= Math.ceil(cost / 2)
  }
  const okPages = pages.filter((p) => p.ok)
  const where = (ps: PageAudit[]) => list(ps.map((p) => path(p.url)))

  add(
    site.https ? { key: 'https', label: 'Secure connection (HTTPS)', status: 'ok', detail: 'The site opens over HTTPS.' } : { key: 'https', label: 'Secure connection (HTTPS)', status: 'bad', detail: 'The site opens without HTTPS. Google ranks it lower and browsers warn visitors.', fix: 'Turn on an SSL certificate at your host (free with Let’s Encrypt) and redirect http to https.' },
    10,
  )
  add(
    site.robots === 'blocks'
      ? { key: 'robots', label: 'robots.txt', status: 'bad', detail: 'robots.txt tells every search engine not to read the site.', fix: 'Remove "Disallow: /" under "User-agent: *".' }
      : site.robots === 'missing'
        ? { key: 'robots', label: 'robots.txt', status: 'warn', detail: 'No robots.txt.', fix: 'Add /robots.txt with "User-agent: *", "Allow: /" and a "Sitemap:" line.' }
        : { key: 'robots', label: 'robots.txt', status: 'ok', detail: 'Search engines may read the site.' },
    20,
  )
  add(
    site.sitemap ? { key: 'sitemap', label: 'Sitemap', status: 'ok', detail: 'A sitemap lists the pages for search engines.' } : { key: 'sitemap', label: 'Sitemap', status: 'warn', detail: 'No sitemap.xml found.', fix: 'Generate a sitemap (most site builders and SEO plugins do it) and submit it in Search Console → Sitemaps.' },
    6,
  )
  const broken = pages.filter((p) => !p.ok)
  if (broken.length) add({ key: 'broken', label: 'Pages that did not open', status: 'bad', detail: `${where(broken)}: ${broken[0].error}`, fix: 'Fix or redirect these pages.' }, 10)
  if (!okPages.length) return { checks, score: Math.max(0, score - 40) }

  const noindex = okPages.filter((p) => p.noindex)
  add(noindex.length ? { key: 'noindex', label: 'Indexing', status: 'bad', detail: `${where(noindex)} ask Google not to index them (noindex).`, fix: 'Remove the robots "noindex" meta tag unless the page should stay out of Google.' } : { key: 'noindex', label: 'Indexing', status: 'ok', detail: 'All checked pages may appear in Google.' }, 20)

  const titles = okPages.map((p) => p.title ?? '')
  const noTitle = okPages.filter((p) => !p.title)
  const badLen = okPages.filter((p) => p.title && (p.title.length < 20 || p.title.length > 65))
  const dup = okPages.filter((p, i) => p.title && titles.indexOf(p.title) !== i)
  add(
    noTitle.length
      ? { key: 'title', label: 'Page titles', status: 'bad', detail: `${where(noTitle)} have no title.`, fix: 'Give every page a unique title of 30–60 characters: the main keyword first, then the brand.' }
      : badLen.length || dup.length
        ? { key: 'title', label: 'Page titles', status: 'warn', detail: [badLen.length ? `${where(badLen)}: title is ${badLen[0].title!.length} characters (best 30–60).` : '', dup.length ? `${where(dup)} repeat another page’s title.` : ''].filter(Boolean).join(' '), fix: 'Main keyword first, 30–60 characters, different on every page.' }
        : { key: 'title', label: 'Page titles', status: 'ok', detail: 'Every page has a unique title of a good length.' },
    10,
  )
  const noDesc = okPages.filter((p) => !p.description)
  const descLen = okPages.filter((p) => p.description && (p.description.length < 70 || p.description.length > 165))
  add(
    noDesc.length
      ? { key: 'description', label: 'Meta descriptions', status: 'warn', detail: `${where(noDesc)} have no description — Google picks random text for the snippet.`, fix: 'Write a 120–160 character description per page: what it offers and a reason to click.' }
      : descLen.length
        ? { key: 'description', label: 'Meta descriptions', status: 'warn', detail: `${where(descLen)}: description length is off (best 120–160).`, fix: 'Keep descriptions 120–160 characters.' }
        : { key: 'description', label: 'Meta descriptions', status: 'ok', detail: 'Every page has a description.' },
    8,
  )
  const h1 = okPages.filter((p) => p.h1 !== 1)
  add(h1.length ? { key: 'h1', label: 'Main heading (H1)', status: 'warn', detail: `${where(h1)}: ${h1[0].h1 === 0 ? 'no H1' : `${h1[0].h1} H1 headings`}.`, fix: 'One H1 per page that says what the page is about, with the main keyword.' } : { key: 'h1', label: 'Main heading (H1)', status: 'ok', detail: 'One H1 per page.' }, 6)
  const imgs = okPages.reduce((s, p) => s + p.images, 0)
  const noAlt = okPages.reduce((s, p) => s + p.imagesNoAlt, 0)
  if (imgs) add(noAlt / imgs > 0.2 ? { key: 'alt', label: 'Image descriptions (alt)', status: 'warn', detail: `${noAlt} of ${imgs} images have no alt text.`, fix: 'Describe each image in a few words (alt="…"): it helps Google Images and screen readers.' } : { key: 'alt', label: 'Image descriptions (alt)', status: 'ok', detail: `${imgs - noAlt} of ${imgs} images are described.` }, 5)
  const noViewport = okPages.filter((p) => !p.viewport)
  add(noViewport.length ? { key: 'mobile', label: 'Mobile friendly', status: 'bad', detail: `${where(noViewport)} have no viewport tag: phones show a zoomed-out desktop page.`, fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> and a responsive layout.' } : { key: 'mobile', label: 'Mobile friendly', status: 'ok', detail: 'Pages declare a mobile viewport.' }, 10)
  const noLang = okPages.filter((p) => !p.lang)
  if (noLang.length) add({ key: 'lang', label: 'Page language', status: 'warn', detail: `${where(noLang)} don’t say their language.`, fix: 'Set <html lang="ka"> (or en, ru) — and hreflang links if the site has several languages.' }, 3)
  const noCanon = okPages.filter((p) => !p.canonical)
  if (noCanon.length) add({ key: 'canonical', label: 'Canonical links', status: 'warn', detail: `${where(noCanon)} have no canonical link.`, fix: 'Add <link rel="canonical" href="…"> so copies with tracking tags count as one page.' }, 3)
  const schema = [...new Set(okPages.flatMap((p) => p.schema))]
  add(
    schema.includes('invalid')
      ? { key: 'schema', label: 'Structured data', status: 'warn', detail: 'Some structured data (JSON-LD) is not valid JSON.', fix: 'Check it with Google’s Rich Results Test.' }
      : schema.length
        ? { key: 'schema', label: 'Structured data', status: 'ok', detail: `Found: ${list(schema, 5)}.` }
        : { key: 'schema', label: 'Structured data', status: 'warn', detail: 'No structured data — Google and AI assistants have to guess what the business is.', fix: 'Add JSON-LD: Organization or LocalBusiness (name, address, phone, hours), Product/Offer for prices, FAQPage for questions.' },
    6,
  )
  const noOg = okPages.filter((p) => !p.og)
  if (noOg.length) add({ key: 'og', label: 'Link previews', status: 'warn', detail: `${where(noOg)} have no og:title/og:image — shared links look bare on Facebook and messengers.`, fix: 'Add Open Graph tags with a 1200×630 image.' }, 3)
  const slow = okPages.filter((p) => p.ms > 2500 || p.kb > 800)
  add(slow.length ? { key: 'speed', label: 'Page weight and speed', status: 'warn', detail: `${where(slow)}: ${slow[0].ms} ms to load the HTML, ${slow[0].kb} KB.`, fix: 'Compress images (WebP), cache pages, and test in PageSpeed Insights.' } : { key: 'speed', label: 'Page weight and speed', status: 'ok', detail: `HTML loads in ${Math.max(...okPages.map((p) => p.ms))} ms or less.` }, 6)
  const thin = okPages.filter((p) => p.words < 200)
  if (thin.length) add({ key: 'content', label: 'Amount of text', status: 'warn', detail: `${where(thin)} have under 200 words.`, fix: 'Pages rank for what they say: describe the offer, prices, area served and common questions.' }, 5)

  if (search) {
    const trend = search.previous.clicks ? (search.totals.clicks - search.previous.clicks) / search.previous.clicks : 0
    checks.push({
      key: 'trend',
      label: 'Clicks from Google',
      status: trend < -0.2 ? 'warn' : 'ok',
      detail: `${search.totals.clicks.toLocaleString('en-US')} clicks in 28 days (${trend >= 0 ? '+' : ''}${Math.round(trend * 100)}%), average position ${search.totals.position.toFixed(1)}.`,
    })
    if (search.striking.length)
      checks.push({ key: 'striking', label: 'Almost on page one', status: 'info', detail: `${search.striking.length} searches where you rank 4–15: ${list(search.striking.map((q) => `“${q.key}”`))}.`, fix: 'Strengthen the page that ranks: use the phrase in the title and H1, add a section answering it, link to it from other pages.' })
    if (search.lowCtr.length)
      checks.push({ key: 'ctr', label: 'Seen but rarely clicked', status: 'info', detail: `${list(search.lowCtr.map((q) => `“${q.key}”`))} show in the top 5 but get under 2% of clicks.`, fix: 'Rewrite the title and description of that page to promise what the searcher wants (price, area, offer).' })
  }
  return { checks, score: Math.max(0, Math.min(100, score)) }
}

export async function runSeoAudit(workspaceId: string, now = new Date()): Promise<SeoReport> {
  const brand = await prisma.brandKit.findUnique({ where: { workspaceId }, select: { website: true } })
  const url = brand?.website ? (/^https?:\/\//.test(brand.website) ? brand.website : `https://${brand.website}`) : null
  const sc = await prisma.socialAccount.findFirst({ where: { workspaceId, network: 'SEARCH_CONSOLE', status: 'ACTIVE' } })

  let search: SeoReport['search'] = null
  let searchError: string | undefined
  if (sc) {
    try {
      const d = await searchData(sc, now)
      search = {
        site: sc.externalId,
        from: d.from,
        to: d.to,
        totals: d.totals,
        previous: d.previous,
        queries: d.queries.slice(0, 20),
        pages: d.pages.slice(0, 10),
        striking: d.queries.filter((q) => q.position >= 4 && q.position <= 15 && q.impressions >= 20).sort((a, b) => b.impressions - a.impressions).slice(0, 10),
        lowCtr: d.queries.filter((q) => q.position <= 5 && q.ctr < 0.02 && q.impressions >= 50).sort((a, b) => b.impressions - a.impressions).slice(0, 5),
      }
    } catch (e) {
      searchError = e instanceof Error ? e.message : String(e)
      await prisma.socialAccount.update({ where: { id: sc.id }, data: { lastError: searchError.slice(0, 500) } })
    }
  }

  const pages: PageAudit[] = []
  let site: SeoReport['site'] = { https: false, robots: 'missing', sitemap: false }
  if (url) {
    const { page: home, html } = await auditPage(url)
    pages.push(home)
    const origin = new URL(home.ok ? home.url : url).origin
    // The pages search brings people to; otherwise links from the home page.
    let more = (search?.pages ?? []).map((p) => p.key).filter((u) => u.startsWith(origin) && path(u) !== path(home.url))
    if (!more.length && home.ok) more = internalLinks(html, home.url)
    pages.push(...(await Promise.all(more.slice(0, 4).map(async (u) => (await auditPage(u)).page))))
    site = { https: origin.startsWith('https:'), ...(await robotsAndSitemap(origin)) }
  }
  const { checks, score } = url ? judgeSeo(pages, site, search) : { checks: [{ key: 'site', label: 'Website', status: 'bad' as const, detail: 'No website in the Brand kit.', fix: 'Add the website address in Brand → Brand kit.' }], score: 0 }
  const report: SeoReport = { url, score, pages, site, checks, search, ...(searchError ? { searchError } : {}) }
  await prisma.websiteAudit.create({ data: { workspaceId, kind: 'SEO', url, result: report } })
  return report
}
