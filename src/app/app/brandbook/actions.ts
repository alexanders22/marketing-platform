'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { aiEnabled, cleanBook, designBrandbook, LANGUAGES, readBrandbook, type BrandbookData } from '@/lib/ai'
import { aiError } from '@/lib/ai-health'
import { requireContext } from '@/lib/context'
import { balanceOf, charge, notEnough, prices } from '@/lib/credits'
import { FONTS } from '@/lib/design'
import { withDossier } from '@/lib/dossier'
import { prisma } from '@/lib/prisma'

const MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 18 * 1024 * 1024

async function save(workspaceId: string, source: 'UPLOAD' | 'GENERATED', data: BrandbookData) {
  const json = data as unknown as Prisma.InputJsonValue
  await prisma.brandbook.upsert({ where: { workspaceId }, create: { workspaceId, source, data: json }, update: { source, data: json } })
}

// The owner's brandbook: PDF or page images, read by the AI.
export async function uploadBrandbook(form: FormData): Promise<{ error?: string }> {
  const { workspace, account } = await requireContext()
  const COST = await prices()
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return { error: 'Choose your brandbook — a PDF or images of its pages' }
  if (files.length > 10) return { error: 'Up to 10 files' }
  if (files.some((f) => !MIMES.includes(f.type))) return { error: 'PDF, PNG, JPG or WEBP only' }
  if (files.reduce((s, f) => s + f.size, 0) > MAX_BYTES) return { error: 'Up to 18 MB in total — export a lighter PDF' }
  const have = await balanceOf(account.id)
  if (have < COST.brandbookRead) return { error: notEnough(COST.brandbookRead, have) }
  let data: BrandbookData
  try {
    data = await readBrandbook(workspace.name, await Promise.all(files.map(async (f) => ({ mime: f.type, data: Buffer.from(await f.arrayBuffer()).toString('base64') }))))
  } catch (e) {
    console.error('readBrandbook failed', e)
    return { error: aiError(e, 'The brandbook could not be read. Try a PDF with selectable text, or images of the pages.') }
  }
  if (!data.colors.length && !data.voice.tone && !data.fonts.heading) return { error: 'No brand rules found in these files. Is it the brandbook?' }
  if (!(await charge(account.id, workspace.id, [{ amount: COST.brandbookRead, reason: 'AI_TEXT', note: 'Brandbook reading', action: 'brandbookRead', units: 1 }]))) {
    return { error: notEnough(COST.brandbookRead, await balanceOf(account.id)) }
  }
  await save(workspace.id, 'UPLOAD', data)
  revalidatePath('/app', 'layout')
  return {}
}

const Answers = z.object({
  personality: z.array(z.string().max(30)).max(5),
  audience: z.string().trim().max(500),
  avoid: z.string().trim().max(500),
  colors: z.string().trim().max(300),
  language: z.string(),
})

// No brandbook: three directions to choose from (not saved until chosen).
export async function designDirections(raw: z.input<typeof Answers>): Promise<{ directions?: BrandbookData[]; error?: string }> {
  const { workspace, account, brand } = await requireContext()
  const COST = await prices()
  if (!aiEnabled()) return { error: 'AI is not connected yet.' }
  const parsed = Answers.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const a = parsed.data
  const have = await balanceOf(account.id)
  if (have < COST.brandbookDesign) return { error: notEnough(COST.brandbookDesign, have) }
  let directions: BrandbookData[]
  try {
    directions = await designBrandbook(workspace.name, await withDossier(brand, workspace.id), a, FONTS, LANGUAGES.find((l) => l === a.language) ?? 'English')
  } catch (e) {
    console.error('designBrandbook failed', e)
    return { error: aiError(e, 'The directions could not be created. Try again.') }
  }
  if (!(await charge(account.id, workspace.id, [{ amount: COST.brandbookDesign, reason: 'AI_TEXT', note: 'Brandbook directions', action: 'brandbookDesign', units: 1 }]))) {
    return { error: notEnough(COST.brandbookDesign, await balanceOf(account.id)) }
  }
  revalidatePath('/app', 'layout')
  return { directions }
}

export async function chooseDirection(raw: BrandbookData): Promise<{ error?: string }> {
  const { workspace } = await requireContext()
  const data = cleanBook(raw)
  if (!data.colors.length) return { error: 'This direction has no colours' }
  await save(workspace.id, 'GENERATED', data)
  await apply(workspace.id, data)
  revalidatePath('/app', 'layout')
  return {}
}

// Colours, fonts, voice — and the audience and description if still empty —
// go into the brand kit, so posts, designs and videos follow the brandbook.
async function apply(workspaceId: string, b: BrandbookData) {
  const kit = await prisma.brandKit.findUnique({ where: { workspaceId } })
  const voice = [b.voice.tone, b.voice.do.length ? `Do: ${b.voice.do.join('; ')}` : '', b.voice.dont.length ? `Don't: ${b.voice.dont.join('; ')}` : ''].filter(Boolean).join('\n')
  const data = {
    ...(b.colors.length ? { colors: b.colors.map((c) => c.hex) } : {}),
    ...(b.fonts.heading || b.fonts.body ? { fonts: [b.fonts.heading, b.fonts.body].filter(Boolean) } : {}),
    ...(voice ? { voice: voice.slice(0, 2000) } : {}),
    ...(!kit?.audience && b.audience ? { audience: b.audience } : {}),
    ...(!kit?.description && b.summary ? { description: b.summary } : {}),
  }
  await prisma.brandKit.upsert({ where: { workspaceId }, create: { workspaceId, ...data }, update: data })
}

export async function applyBrandbook(): Promise<{ error?: string }> {
  const { workspace } = await requireContext()
  const book = await prisma.brandbook.findUnique({ where: { workspaceId: workspace.id } })
  if (!book) return { error: 'No brandbook yet' }
  await apply(workspace.id, book.data as unknown as BrandbookData)
  revalidatePath('/app', 'layout')
  return {}
}

export async function deleteBrandbook() {
  const { workspace } = await requireContext()
  await prisma.brandbook.deleteMany({ where: { workspaceId: workspace.id } })
  revalidatePath('/app', 'layout')
}
