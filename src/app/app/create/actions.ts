'use server'

import { withDossier } from '@/lib/dossier'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { aiEnabled, generateImage, generatePost, LANGUAGES, LENGTHS, TONES } from '@/lib/ai'
import { requireContext } from '@/lib/context'
import { charge, notEnough, prices } from '@/lib/credits'
import { prisma } from '@/lib/prisma'
import { mediaUrl, saveMedia } from '@/lib/storage'
import { aiError } from '@/lib/ai-health'

const MAX_ATTACHMENT_B64 = 2_800_000 // ~2 MB per image after base64

const Input = z.object({
  prompt: z.string().trim().min(3, 'Describe the post you want').max(2000),
  tone: z.enum(TONES),
  length: z.enum(LENGTHS),
  language: z.enum(LANGUAGES),
  aiHashtags: z.boolean(),
  libraryIds: z.array(z.string()).max(10),
  images: z.number().int().min(0).max(4),
  attachments: z
    .array(
      z.object({
        mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        data: z.string().max(MAX_ATTACHMENT_B64, 'Attached image is too large'),
      }),
    )
    .max(3, 'Attach up to 3 images'),
})

export type CreatedPost = {
  caption: string
  hashtags: string[]
  images: { id: string; url: string }[]
  imagesFailed: number
  charged: number
}

export async function createPost(raw: z.input<typeof Input>): Promise<{ post?: CreatedPost; error?: string }> {
  const { account, workspace, brand } = await requireContext()
  const parsed = Input.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const input = parsed.data

  if (!aiEnabled()) return { error: 'AI generation is not connected yet.' }
  const { postText: TEXT_COST, image: IMAGE_COST } = await prices()
  const maxCost = TEXT_COST + input.images * IMAGE_COST
  if (account.creditBalance < maxCost) {
    return { error: notEnough(maxCost, account.creditBalance) }
  }

  const known = await withDossier(brand, workspace.id)
  let text
  try {
    text = await generatePost(workspace.name, known, { ...input, aiHashtags: input.aiHashtags })
  } catch (e) {
    console.error('generatePost failed', e)
    return { error: aiError(e, 'The AI could not write this post. Please try again.') }
  }

  // Library hashtags are added as-is; AI ones only if switched on. Case-insensitive de-dupe.
  const libraries = input.libraryIds.length
    ? await prisma.hashtagLibrary.findMany({ where: { id: { in: input.libraryIds }, workspaceId: workspace.id } })
    : []
  const seen = new Set<string>()
  const hashtags = [...text.hashtags, ...libraries.flatMap((l) => l.tags)].filter((t) => {
    const k = t.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  const results = await Promise.allSettled(
    Array.from({ length: input.images }, (_, i) =>
      generateImage(workspace.name, known, input.prompt, text.caption, i, input.attachments).then((img) =>
        saveMedia(workspace.id, img.data, img.mime, input.prompt),
      ),
    ),
  )
  const media = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  results.forEach((r) => r.status === 'rejected' && console.error('generateImage failed', r.reason))

  // Charge only for what was delivered. The conditional update keeps the
  // balance from going negative if two generations race.
  const cost = TEXT_COST + media.length * IMAGE_COST
  const charged = await charge(account.id, workspace.id, [
    { amount: TEXT_COST, reason: 'AI_TEXT', note: 'Social post', action: 'postText', units: 1 },
    { amount: media.length * IMAGE_COST, reason: 'AI_IMAGE', note: `${media.length} post image${media.length > 1 ? 's' : ''}`, action: 'image', units: media.length },
  ])
  if (!charged) return { error: 'You ran out of credits while this was generating. Choose a plan to get more.' }

  revalidatePath('/app', 'layout')
  return {
    post: {
      caption: text.caption,
      hashtags,
      images: media.map((m) => ({ id: m.id, url: mediaUrl(m.id) })),
      imagesFailed: input.images - media.length,
      charged: cost,
    },
  }
}

// ─── Hashtag libraries ─────────────────────────────────────────────────────

// Valid tags, de-duplicated without regard to case (first spelling wins).
const normTags = (raw: string) => {
  const seen = new Set<string>()
  return raw
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#+/, '').trim())
    .filter((t) => /^[\p{L}\p{N}_]{1,60}$/u.test(t))
    .filter((t) => !seen.has(t.toLowerCase()) && (seen.add(t.toLowerCase()), true))
}

const Library = z.object({
  name: z.string().trim().min(1, 'Give the library a name').max(60),
  tags: z.string().max(3000),
})

export async function saveHashtagLibrary(input: { id?: string; name: string; tags: string }) {
  const { workspace } = await requireContext()
  const parsed = Library.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const tags = normTags(parsed.data.tags)
  if (tags.length === 0) return { error: 'Add at least one hashtag' }
  if (tags.length > 30) return { error: `A library can hold up to 30 hashtags — this one has ${tags.length}` }

  if (input.id) {
    const res = await prisma.hashtagLibrary.updateMany({
      where: { id: input.id, workspaceId: workspace.id },
      data: { name: parsed.data.name, tags },
    })
    if (res.count === 0) return { error: 'Library not found' }
  } else {
    if ((await prisma.hashtagLibrary.count({ where: { workspaceId: workspace.id } })) >= 50) {
      return { error: 'You can keep up to 50 libraries' }
    }
    await prisma.hashtagLibrary.create({ data: { workspaceId: workspace.id, name: parsed.data.name, tags } })
  }
  revalidatePath('/app/create')
  return { libraries: await listLibraries(workspace.id) }
}

export async function deleteHashtagLibrary(id: string) {
  const { workspace } = await requireContext()
  await prisma.hashtagLibrary.deleteMany({ where: { id, workspaceId: workspace.id } })
  revalidatePath('/app/create')
  return { libraries: await listLibraries(workspace.id) }
}

async function listLibraries(workspaceId: string) {
  return prisma.hashtagLibrary.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, tags: true },
  })
}
