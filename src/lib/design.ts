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
      const base = { ...l, x: l.x * sx, y: l.y * sy, w: l.w * sx, h: l.h * sy }
      return l.type === 'text' ? { ...base, fontSize: Math.max(8, Math.round((l as TextLayer).fontSize * s)) } : base
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

export type Template = { id: string; name: string; build: (pal: Palette, brand: string) => DesignDoc }

// All templates are authored for 1080×1080 and resized to the chosen format.
export const TEMPLATES: Template[] = [
  {
    id: 'sale',
    name: 'Sale announcement',
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
    build: (c) => ({ background: c.light, layers: [] }),
  },
]

// ─── Rendering to a <canvas> (export) ─────────────────────────────────────

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > width && line) {
        lines.push(line)
        line = word
      } else line = test
    }
    lines.push(line)
  }
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
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

  for (const l of doc.layers) {
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
      ctx.textBaseline = 'top'
      ctx.textAlign = l.align
      const lines = wrap(ctx, l.text, l.w)
      const x = l.align === 'center' ? l.w / 2 : l.align === 'right' ? l.w : 0
      lines.forEach((line, i) => ctx.fillText(line, x, i * l.fontSize * l.lineHeight))
    }
    ctx.restore()
  }
  return canvas
}
