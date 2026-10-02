'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'

export type BrandState = { ok?: boolean; error?: string } | undefined

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)

const Brand = z.object({
  website: optional(300).refine((v) => !v || /^https?:\/\/\S+\.\S+/.test(v), 'Website must start with http:// or https://'),
  description: optional(2000),
  voice: optional(500),
  audience: optional(1000),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colours must be hex like #FF6000')).max(6),
  fonts: z.array(z.string().trim().min(1).max(60)).max(4),
})

export async function saveBrand(_: BrandState, form: FormData): Promise<BrandState> {
  const { workspace } = await requireContext()
  const parsed = Brand.safeParse({
    website: form.get('website') ?? '',
    description: form.get('description') ?? '',
    voice: form.get('voice') ?? '',
    audience: form.get('audience') ?? '',
    colors: form.getAll('colors').map(String).filter(Boolean),
    fonts: String(form.get('fonts') ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  await prisma.brandKit.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, ...parsed.data },
    update: parsed.data,
  })
  revalidatePath('/app', 'layout')
  return { ok: true }
}
