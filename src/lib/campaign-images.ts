import 'server-only'
import { generateImage } from './ai'
import { noteAiFailure } from './ai-health'
import { charge, prices } from './credits'
import { withDossier } from './dossier'
import { IMAGE_STYLES, type ImageStyle } from './image-styles'
import { prisma } from './prisma'
import { saveMedia } from './storage'

export type CampaignImagePlan = { prompt: string | null; style: ImageStyle }

// AI images for a campaign's posts that have none, three at a time, in the
// background. Each image is charged once it exists; out of credits stops.
export async function generateCampaignImages(campaignId: string, plan: CampaignImagePlan) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { workspace: { include: { brandKit: true, account: { select: { id: true } } } }, posts: { orderBy: { scheduledAt: 'asc' } } },
  })
  if (!campaign?.workspace.account) return
  const ws = campaign.workspace
  const accountId = ws.account!.id
  const todo = campaign.posts.filter((p) => p.mediaIds.length === 0)
  const known = await withDossier(ws.brandKit, ws.id)
  const COST = await prices()
  const style = IMAGE_STYLES[plan.style]
  let stop = false

  const one = async (post: (typeof todo)[number], i: number) => {
    if (stop) return
    try {
      const brief = plan.prompt ? plan.prompt : [post.title, post.content.slice(0, 300)].filter(Boolean).join(': ')
      const img = await generateImage(ws.name, known, brief, post.content.slice(0, 1500), plan.prompt ? i : 0, [], '1:1', style)
      const media = await saveMedia(ws.id, img.data, img.mime, `Campaign image: ${brief.slice(0, 200)}`)
      const ok = await charge(accountId, ws.id, [{ amount: COST.image, reason: 'AI_IMAGE', note: `Campaign image: ${campaign.name}`.slice(0, 200), action: 'image', units: 1 }])
      if (!ok) {
        stop = true
        return
      }
      // Only if the post still has no picture (someone may have added one).
      await prisma.post.updateMany({ where: { id: post.id, mediaIds: { isEmpty: true } }, data: { mediaIds: [media.id] } })
    } catch (e) {
      noteAiFailure(e)
      console.error('campaign image failed', post.id, e instanceof Error ? e.message : e)
    } finally {
      await prisma.campaign.update({ where: { id: campaignId }, data: { imagesDone: { increment: 1 } } })
    }
  }

  const queue = todo.map((p, i) => () => one(p, i))
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) await job()
    }),
  )
  await prisma.campaign.update({ where: { id: campaignId }, data: { imageStatus: 'DONE' } })
}
