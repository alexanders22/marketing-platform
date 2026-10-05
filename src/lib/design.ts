// Studio design model — shared by the editor (client) and server validation.
// Coordinates are in design pixels (e.g. 1080×1080), top-left origin.

export type TextLayer = {
  id: string
  type: 'text'
  name: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  text: string
  fontSize: number
  fontWeight: 400 | 600 | 800
  fontFamily: string
  color: string
  align: 'left' | 'center' | 'right'
  lineHeight: number
}

export type ShapeLayer = {
  id: string
  type: 'shape'
  name: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  shape: 'rect' | 'ellipse'
  fill: string
  radius: number
  opacity: number
}

export type ImageLayer = {
  id: string
  type: 'image'
  name: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  mediaId: string
  src: string
  fit: 'cover' | 'contain'
  radius: number
  opacity: number
}

export type Layer = TextLayer | ShapeLayer | ImageLayer

export type DesignDoc = { background: string; layers: Layer[] }

export const SIZES = [
  { id: 'ig-post', name: 'Instagram post', w: 1080, h: 1080 },
  { id: 'ig-portrait', name: 'Instagram portrait', w: 1080, h: 1350 },
  { id: 'story', name: 'Story / Reel', w: 1080, h: 1920 },
  { id: 'fb-post', name: 'Facebook post', w: 1200, h: 630 },
  { id: 'linkedin', name: 'LinkedIn post', w: 1200, h: 627 },
  { id: 'x-post', name: 'X post', w: 1600, h: 900 },
  { id: 'youtube', name: 'YouTube thumbnail', w: 1280, h: 720 },
] as const

export const FONTS = ['Inter', 'Georgia', 'Arial', 'Courier New', 'Trebuchet MS'] as const

export const uid = () => Math.random().toString(36).slice(2, 10)

// Keep each layer's position relative to the canvas when switching sizes;
// text scales with the smaller side so it stays readable.
export function resizeDoc(doc: DesignDoc, from: { w: number; h: number }, to: { w: number; h: number }): DesignDoc {
  const sx = to.w / from.w
  const sy = to.h / from.h
  const s = Math.min(sx, sy)
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      // Circles (round shapes, round photos) keep their proportions, centred
      // where they were.
      const round = (l.type === 'shape' && l.shape === 'ellipse') || (l.type !== 'text' && l.radius * 2 >= Math.min(l.w, l.h) && l.w === l.h)
      const base = round
        ? { ...l, x: (l.x + l.w / 2) * sx - (l.w * s) / 2, y: (l.y + l.h / 2) * sy - (l.h * s) / 2, w: l.w * s, h: l.h * s }
        : { ...l, x: l.x * sx, y: l.y * sy, w: l.w * sx, h: l.h * sy }
      if (l.type === 'text') return { ...base, fontSize: Math.max(8, Math.round(l.fontSize * s)) }
      return { ...base, radius: l.radius * s }
    }) as Layer[],
  }
}

// ─── Templates ───────────────────────────────────────────────────────────
// Built from the brand palette, so every template is "on brand" out of the box.

type Palette = { primary: string; secondary: string; dark: string; light: string }

export function palette(colors: string[]): Palette {
  const pick = (i: number, fallback: string) => colors[i] ?? fallback
  return { primary: pick(0, '#FF6000'), secondary: pick(1, '#7C3AED'), dark: '#111111', light: '#FFFFFF' }
}

const text = (p: Partial<TextLayer> & Pick<TextLayer, 'text' | 'x' | 'y' | 'w' | 'h'>): TextLayer => ({
  id: uid(),
  type: 'text',
  name: p.name ?? 'Text',
  rotation: 0,
  fontSize: 64,
  fontWeight: 800,
  fontFamily: 'Inter',
  color: '#FFFFFF',
  align: 'left',
  lineHeight: 1.1,
  ...p,
})

const shape = (p: Partial<ShapeLayer> & Pick<ShapeLayer, 'x' | 'y' | 'w' | 'h' | 'fill'>): ShapeLayer => ({
  id: uid(),
  type: 'shape',
  name: p.name ?? 'Shape',
  rotation: 0,
  shape: 'rect',
  radius: 0,
  opacity: 1,
  ...p,
})

// Template photos ship with the app (public/templates/…). In a template they
// are "tpl:<category>/<name>"; creating a design copies them into the
// workspace's media, so saved designs only point at the workspace's files.
export const TEMPLATE_PHOTO = 'tpl:'
export const templatePhotoUrl = (ref: string) => `/templates/${ref}.jpg`
// Photos that ship with the templates, offered in pickers.
export const TEMPLATE_PHOTO_LIBRARY = [
  { category: 'Real estate', refs: ['real-estate/exterior', 'real-estate/living', 'real-estate/kitchen', 'real-estate/bedroom', 'real-estate/terrace', 'real-estate/villa', 'real-estate/agent'] },
] as const
export const isTemplatePhoto = (id: string) => id.startsWith(TEMPLATE_PHOTO) && /^tpl:[a-z-]+\/[a-z-]+$/.test(id)

const photo = (ref: string, p: Partial<ImageLayer> & Pick<ImageLayer, 'x' | 'y' | 'w' | 'h'>): ImageLayer => ({
  id: uid(),
  type: 'image',
  name: p.name ?? 'Photo',
  rotation: 0,
  mediaId: `${TEMPLATE_PHOTO}${ref}`,
  src: templatePhotoUrl(ref),
  fit: 'cover',
  radius: 0,
  opacity: 1,
  ...p,
})

export const TEMPLATE_CATEGORIES = [
  { id: 'real-estate', name: 'Real estate' },
  { id: 'general', name: 'General' },
] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]['id']

export type Template = { id: string; name: string; category: TemplateCategory; build: (pal: Palette, brand: string) => DesignDoc }


// ─── Real estate ───────────────────────────────────────────────────────────
const RE = 'real-estate'
const REAL_ESTATE: Template[] = [
  {
    id: 're-just-listed',
    name: 'Just listed',
    category: RE,
    build: (c, brand) => ({
      background: c.dark,
      layers: [
        photo(`${RE}/exterior`, { x: 0, y: 0, w: 1080, h: 1080 }),
        shape({ name: 'Shade', x: 0, y: 600, w: 1080, h: 480, fill: '#000000', opacity: 0.62 }),
        shape({ name: 'Badge', x: 70, y: 70, w: 340, h: 84, fill: c.primary, radius: 42 }),
        text({ name: 'Badge text', text: 'JUST LISTED', x: 70, y: 92, w: 340, h: 44, fontSize: 36, fontWeight: 800, color: c.light, align: 'center' }),
        text({ name: 'Price', text: '$245,000', x: 70, y: 660, w: 940, h: 110, fontSize: 104, color: c.light }),
        text({ name: 'Address', text: 'Vake, Tbilisi · Chavchavadze Ave', x: 70, y: 790, w: 940, h: 56, fontSize: 44, fontWeight: 600, color: c.light }),
        text({ name: 'Details', text: '3 bedrooms · 2 baths · 118 m²', x: 70, y: 860, w: 940, h: 50, fontSize: 38, fontWeight: 400, color: '#E4E4E7' }),
        text({ name: 'Brand', text: brand, x: 70, y: 970, w: 940, h: 44, fontSize: 32, fontWeight: 600, color: '#A1A1AA' }),
      ],
    }),
  },
  {
    id: 're-open-house',
    name: 'Open house',
    category: RE,
    build: (c) => ({
      background: c.light,
      layers: [
        photo(`${RE}/living`, { x: 0, y: 0, w: 1080, h: 620 }),
        text({ name: 'Label', text: 'OPEN HOUSE', x: 70, y: 670, w: 940, h: 50, fontSize: 42, fontWeight: 800, color: c.primary }),
        text({ name: 'When', text: 'Saturday · 14:00–17:00', x: 70, y: 735, w: 940, h: 90, fontSize: 78, color: c.dark }),
        text({ name: 'Where', text: 'Chavchavadze Ave 12, Tbilisi', x: 70, y: 840, w: 940, h: 54, fontSize: 42, fontWeight: 400, color: '#52525B' }),
        shape({ name: 'Button', x: 70, y: 930, w: 400, h: 96, fill: c.primary, radius: 48 }),
        text({ name: 'Button text', text: 'Book a visit', x: 70, y: 955, w: 400, h: 50, fontSize: 40, fontWeight: 600, color: c.light, align: 'center' }),
      ],
    }),
  },
  {
    id: 're-sold',
    name: 'Sold',
    category: RE,
    build: (c, brand) => ({
      background: c.dark,
      layers: [
        photo(`${RE}/villa`, { x: 0, y: 0, w: 1080, h: 1080 }),
        shape({ name: 'Shade', x: 0, y: 0, w: 1080, h: 1080, fill: '#000000', opacity: 0.35 }),
        shape({ name: 'Ribbon', x: -120, y: 380, w: 1320, h: 230, fill: c.primary, rotation: -8, opacity: 0.95 }),
        text({ name: 'Sold', text: 'SOLD', x: 0, y: 395, w: 1080, h: 200, fontSize: 190, color: c.light, align: 'center', rotation: -8, lineHeight: 1 }),
        text({ name: 'Line', text: 'Another family has a new home', x: 70, y: 880, w: 940, h: 60, fontSize: 48, fontWeight: 600, color: c.light, align: 'center' }),
        text({ name: 'Brand', text: brand, x: 70, y: 960, w: 940, h: 44, fontSize: 34, fontWeight: 400, color: '#E4E4E7', align: 'center' }),
      ],
    }),
  },
  {
    id: 're-price-drop',
    name: 'New price',
    category: RE,
    build: (c) => ({
      background: c.light,
      layers: [
        photo(`${RE}/kitchen`, { x: 0, y: 0, w: 1080, h: 1080 }),
        shape({ name: 'Badge', shape: 'ellipse', x: 770, y: 60, w: 250, h: 250, fill: c.secondary }),
        text({ name: 'Badge text', text: 'NEW PRICE', x: 790, y: 140, w: 210, h: 100, fontSize: 40, fontWeight: 800, color: c.light, align: 'center', lineHeight: 1.05 }),
        shape({ name: 'Card', x: 60, y: 690, w: 960, h: 330, fill: c.light, radius: 32 }),
        text({ name: 'Was', text: 'Was $260,000', x: 110, y: 730, w: 860, h: 50, fontSize: 40, fontWeight: 400, color: '#71717A' }),
        text({ name: 'Now', text: 'Now $239,000', x: 110, y: 790, w: 860, h: 110, fontSize: 96, color: c.primary }),
        text({ name: 'Where', text: '2-bed apartment · Saburtalo · 86 m²', x: 110, y: 920, w: 860, h: 50, fontSize: 38, fontWeight: 600, color: c.dark }),
      ],
    }),
  },
  {
    id: 're-new-project',
    name: 'New development',
    category: RE,
    build: (c) => ({
      background: c.primary,
      layers: [
        photo(`${RE}/terrace`, { x: 540, y: 0, w: 540, h: 1080 }),
        text({ name: 'Label', text: 'NEW PROJECT', x: 60, y: 90, w: 440, h: 48, fontSize: 38, fontWeight: 800, color: c.light }),
        text({ name: 'Headline', text: 'Homes with a view', x: 60, y: 170, w: 450, h: 260, fontSize: 92, color: c.light, lineHeight: 1.02 }),
        text({ name: 'Price', text: 'Pre-sale from $1,150/m²', x: 60, y: 520, w: 450, h: 120, fontSize: 50, fontWeight: 600, color: c.light, lineHeight: 1.15 }),
        text({ name: 'Details', text: 'Delivery Q4 2027\n0% instalments', x: 60, y: 680, w: 450, h: 120, fontSize: 40, fontWeight: 400, color: c.light, lineHeight: 1.3 }),
        shape({ name: 'Button', x: 60, y: 900, w: 430, h: 96, fill: c.light, radius: 48 }),
        text({ name: 'Button text', text: 'Get the price list', x: 60, y: 925, w: 430, h: 50, fontSize: 38, fontWeight: 600, color: c.dark, align: 'center' }),
      ],
    }),
  },
  {
    id: 're-gallery',
    name: 'Listing gallery',
    category: RE,
    build: (c) => ({
      background: c.light,
      layers: [
        photo(`${RE}/living`, { name: 'Main photo', x: 60, y: 60, w: 960, h: 520, radius: 28 }),
        photo(`${RE}/kitchen`, { name: 'Photo 2', x: 60, y: 600, w: 470, h: 280, radius: 24 }),
        photo(`${RE}/bedroom`, { name: 'Photo 3', x: 550, y: 600, w: 470, h: 280, radius: 24 }),
        text({ name: 'Title', text: '2-bed apartment in Saburtalo', x: 60, y: 910, w: 960, h: 56, fontSize: 48, color: c.dark }),
        text({ name: 'Price', text: '$168,000 · 86 m² · 9th floor', x: 60, y: 975, w: 960, h: 50, fontSize: 40, fontWeight: 600, color: c.primary }),
      ],
    }),
  },
  {
    id: 're-agent',
    name: 'Meet the agent',
    category: RE,
    build: (c) => ({
      background: c.dark,
      layers: [
        photo(`${RE}/agent`, { name: 'Agent photo', x: 340, y: 110, w: 400, h: 400, radius: 200 }),
        text({ name: 'Label', text: 'MEET YOUR AGENT', x: 90, y: 570, w: 900, h: 46, fontSize: 36, fontWeight: 800, color: c.primary, align: 'center' }),
        text({ name: 'Name', text: 'Nino Beridze', x: 90, y: 630, w: 900, h: 90, fontSize: 80, color: c.light, align: 'center' }),
        text({ name: 'About', text: '12 years helping families find a home in Tbilisi', x: 140, y: 740, w: 800, h: 110, fontSize: 40, fontWeight: 400, color: '#D4D4D8', align: 'center', lineHeight: 1.3 }),
        text({ name: 'Contact', text: '+995 555 12 34 56', x: 90, y: 910, w: 900, h: 56, fontSize: 46, fontWeight: 600, color: c.light, align: 'center' }),
      ],
    }),
  },
  {
    id: 're-market',
    name: 'Market update',
    category: RE,
    build: (c, brand) => ({
      background: c.light,
      layers: [
        shape({ name: 'Top band', x: 0, y: 0, w: 1080, h: 16, fill: c.primary }),
        text({ name: 'Label', text: 'MARKET UPDATE · Q3', x: 90, y: 120, w: 900, h: 50, fontSize: 40, fontWeight: 800, color: c.primary }),
        text({ name: 'Stat', text: '$1,180/m²', x: 90, y: 230, w: 900, h: 170, fontSize: 150, color: c.dark, lineHeight: 1 }),
        text({ name: 'Change', text: '+4.2% vs last quarter', x: 90, y: 430, w: 900, h: 70, fontSize: 56, fontWeight: 600, color: '#16A34A' }),
        text({ name: 'Context', text: 'Average price of new apartments in Tbilisi. Prices keep rising in Vake and Saburtalo — a good time to sell.', x: 90, y: 560, w: 900, h: 260, fontSize: 42, fontWeight: 400, color: '#3F3F46', lineHeight: 1.35 }),
        text({ name: 'Brand', text: brand, x: 90, y: 940, w: 900, h: 50, fontSize: 36, fontWeight: 600, color: c.dark }),
      ],
    }),
  },
]

// All templates are authored for 1080×1080 and resized to the chosen format.
export const TEMPLATES: Template[] = [
  ...REAL_ESTATE,
  {
    id: 'sale',
    name: 'Sale announcement',
    category: 'general',
    build: (c) => ({
      background: c.primary,
      layers: [
        shape({ name: 'Circle', shape: 'ellipse', x: 600, y: -160, w: 640, h: 640, fill: c.secondary, opacity: 0.9 }),
        text({ name: 'Kicker', text: 'LIMITED TIME', x: 90, y: 150, w: 600, h: 60, fontSize: 36, fontWeight: 600, color: c.light }),
        text({ name: 'Headline', text: '20% OFF', x: 90, y: 230, w: 900, h: 200, fontSize: 170, color: c.light, lineHeight: 1 }),
        text({ name: 'Details', text: 'On everything this weekend only', x: 90, y: 470, w: 800, h: 120, fontSize: 48, fontWeight: 400, color: c.light, lineHeight: 1.25 }),
        shape({ name: 'Button', x: 90, y: 820, w: 420, h: 110, fill: c.light, radius: 55 }),
        text({ name: 'Button text', text: 'Shop now', x: 90, y: 848, w: 420, h: 60, fontSize: 44, fontWeight: 600, color: c.dark, align: 'center' }),
      ],
    }),
  },
  {
    id: 'quote',
    name: 'Quote',
    category: 'general',
    build: (c, brand) => ({
      background: c.light,
      layers: [
        shape({ name: 'Accent bar', x: 90, y: 160, w: 16, h: 600, fill: c.primary }),
        text({ name: 'Quote mark', text: '“', x: 140, y: 90, w: 200, h: 200, fontSize: 260, fontFamily: 'Georgia', color: c.primary }),
        text({ name: 'Quote', text: 'The best way to predict the future is to create it.', x: 140, y: 300, w: 850, h: 400, fontSize: 72, fontWeight: 600, fontFamily: 'Georgia', color: c.dark, lineHeight: 1.2 }),
        text({ name: 'Author', text: `— ${brand}`, x: 140, y: 840, w: 800, h: 60, fontSize: 40, fontWeight: 400, color: '#555555' }),
      ],
    }),
  },
  {
    id: 'product',
    name: 'Product spotlight',
    category: 'general',
    build: (c) => ({
      background: c.dark,
      layers: [
        shape({ name: 'Photo frame', x: 90, y: 90, w: 900, h: 620, fill: c.secondary, radius: 40 }),
        text({ name: 'Photo hint', text: 'Drop your product photo here', x: 90, y: 370, w: 900, h: 60, fontSize: 36, fontWeight: 400, color: c.light, align: 'center' }),
        text({ name: 'Product name', text: 'New collection', x: 90, y: 760, w: 700, h: 90, fontSize: 76, color: c.light }),
        text({ name: 'Price', text: 'from ₾49', x: 90, y: 870, w: 600, h: 70, fontSize: 52, fontWeight: 600, color: c.primary }),
      ],
    }),
  },
  {
    id: 'event',
    name: 'Event invite',
    category: 'general',
    build: (c) => ({
      background: c.secondary,
      layers: [
        shape({ name: 'Card', x: 80, y: 80, w: 920, h: 920, fill: c.light, radius: 48 }),
        text({ name: 'Label', text: 'YOU ARE INVITED', x: 160, y: 180, w: 760, h: 60, fontSize: 36, fontWeight: 600, color: c.primary, align: 'center' }),
        text({ name: 'Title', text: 'Grand Opening', x: 160, y: 300, w: 760, h: 200, fontSize: 110, color: c.dark, align: 'center', lineHeight: 1.05 }),
        text({ name: 'Date', text: 'Saturday · 18:00', x: 160, y: 620, w: 760, h: 70, fontSize: 52, fontWeight: 400, color: c.dark, align: 'center' }),
        text({ name: 'Place', text: 'Tbilisi, Rustaveli Ave 1', x: 160, y: 700, w: 760, h: 60, fontSize: 40, fontWeight: 400, color: '#666666', align: 'center' }),
      ],
    }),
  },
  {
    id: 'tip',
    name: 'Tip of the day',
    category: 'general',
    build: (c) => ({
      background: c.light,
      layers: [
        shape({ name: 'Top band', x: 0, y: 0, w: 1080, h: 260, fill: c.primary }),
        text({ name: 'Label', text: 'TIP #1', x: 90, y: 90, w: 800, h: 90, fontSize: 80, color: c.light }),
        text({ name: 'Tip', text: 'Write one clear tip your customers can use today.', x: 90, y: 360, w: 900, h: 420, fontSize: 76, fontWeight: 600, color: c.dark, lineHeight: 1.2 }),
        shape({ name: 'Footer line', x: 90, y: 900, w: 200, h: 10, fill: c.secondary }),
      ],
    }),
  },
  {
    id: 'blank',
    name: 'Blank',
    category: 'general',
    build: (c) => ({ background: c.light, layers: [] }),
  },
]

// ─── Rendering to a <canvas> (export) ─────────────────────────────────────

// Word wrap matching the editor's CSS (`overflow-wrap: break-word`): words
// longer than the line are broken by character.
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width <= width || !line) {
        line = test
      } else {
        lines.push(line)
        line = word
      }
      // A single word wider than the box: split it across lines.
      while (ctx.measureText(line).width > width && line.length > 1) {
        let cut = line.length - 1
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > width) cut--
        lines.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    lines.push(line)
  }
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, rr)
}

// `interFamily` is the real CSS family next/font registered for Inter (it is
// not literally "Inter"), so exports match the editor.
export async function renderToCanvas(doc: DesignDoc, w: number, h: number, interFamily = 'Arial'): Promise<HTMLCanvasElement> {
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = doc.background
  ctx.fillRect(0, 0, w, h)

  for (const raw of doc.layers) {
    // Defensive: never let a bad size break the whole export.
    const l = { ...raw, w: Math.max(1, Math.abs(raw.w)), h: Math.max(1, Math.abs(raw.h)) } as Layer
    ctx.save()
    ctx.translate(l.x + l.w / 2, l.y + l.h / 2)
    ctx.rotate((l.rotation * Math.PI) / 180)
    ctx.translate(-l.w / 2, -l.h / 2)
    if (l.type === 'shape') {
      ctx.globalAlpha = l.opacity
      ctx.fillStyle = l.fill
      if (l.shape === 'ellipse') {
        ctx.beginPath()
        ctx.ellipse(l.w / 2, l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2)
      } else roundRect(ctx, 0, 0, l.w, l.h, l.radius)
      ctx.fill()
    } else if (l.type === 'image') {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = rej
        i.src = l.src
      })
      ctx.globalAlpha = l.opacity
      roundRect(ctx, 0, 0, l.w, l.h, l.radius)
      ctx.clip()
      const ir = img.width / img.height
      const br = l.w / l.h
      let dw = l.w
      let dh = l.h
      if ((l.fit === 'cover') === ir > br) dw = l.h * ir
      else dh = l.w / ir
      ctx.drawImage(img, (l.w - dw) / 2, (l.h - dh) / 2, dw, dh)
    } else {
      ctx.fillStyle = l.color
      ctx.font = `${l.fontWeight} ${l.fontSize}px ${l.fontFamily === 'Inter' ? interFamily : l.fontFamily}`
      ctx.textAlign = l.align
      // Place each line like CSS: line box = fontSize × lineHeight, glyphs
      // centred in it by the font's ascent/descent (half-leading).
      ctx.textBaseline = 'alphabetic'
      const m = ctx.measureText('Hg')
      const ascent = m.fontBoundingBoxAscent || l.fontSize * 0.97
      const descent = m.fontBoundingBoxDescent || l.fontSize * 0.24
      const lineBox = l.fontSize * l.lineHeight
      const baseline = (lineBox - (ascent + descent)) / 2 + ascent
      const lines = wrap(ctx, l.text, l.w)
      const x = l.align === 'center' ? l.w / 2 : l.align === 'right' ? l.w : 0
      lines.forEach((line, i) => ctx.fillText(line, x, i * lineBox + baseline))
    }
    ctx.restore()
  }
  return canvas
}
