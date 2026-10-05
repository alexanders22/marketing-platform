'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireContext } from '@/lib/context'
import { prisma } from '@/lib/prisma'

const Input = z.object({
  id: z.string().max(40).nullable(),
  name: z.string().trim().min(1, 'Give the character a name').max(60),
  description: z.string().trim().max(400),
  photoIds: z.array(z.string().max(40)).min(1, 'Add at least one photo').max(3, 'Up to 3 photos'),
  person: z.boolean(),
  consent: z.boolean(),
})

// A character for AI clips: 1–3 reference photos of one person, mascot or
// product. A real person needs the uploader's confirmation that they may use
// that person's likeness.
export async function saveCharacter(raw: z.input<typeof Input>): Promise<{ id?: string; error?: string }> {
  const { workspace } = await requireContext()
  const parsed = Input.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const c = parsed.data
  if (c.person && !c.consent) return { error: 'Confirm you have permission to use this person’s likeness' }
  const ids = [...new Set(c.photoIds)]
  if ((await prisma.media.count({ where: { id: { in: ids }, workspaceId: workspace.id, kind: 'IMAGE' } })) !== ids.length) return { error: 'Some photos are not available' }
  const data = { name: c.name, description: c.description, photoIds: ids, consentAt: c.person ? new Date() : null }
  if (c.id) {
    const res = await prisma.character.updateMany({ where: { id: c.id, workspaceId: workspace.id }, data })
    if (res.count === 0) return { error: 'Character not found' }
    revalidatePath('/app/studio/characters')
    return { id: c.id }
  }
  const created = await prisma.character.create({ data: { ...data, workspaceId: workspace.id } })
  revalidatePath('/app/studio/characters')
  return { id: created.id }
}

export async function deleteCharacter(id: string) {
  const { workspace } = await requireContext()
  await prisma.character.deleteMany({ where: { id, workspaceId: workspace.id } })
  revalidatePath('/app/studio/characters')
}
