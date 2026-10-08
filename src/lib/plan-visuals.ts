import 'server-only'
import type { Prisma } from '@prisma/client'
import { generateImage } from './ai'
import { noteAiFailure } from './ai-health'
import { charge } from './credits'
import { withDossier } from './dossier'
import type { Prices } from './pricing'
import { prisma } from './prisma'
import { saveMedia, mediaUrl } from './storage'
import type { PlanData } from './strategist'
import { emptyDoc, newScene, type VideoDoc } from './video'
import { enqueueRender, waitForRender } from './video-render'

// Pictures and videos for a plan's posts, made before they go out: a photo
// post gets one AI image, a Reel / video post a short vertical video (AI
// images with motion, rendered to MP4). Runs in the background; each image
// is charged once it exists and running out of credits stops the rest.

export const isVideoFormat = (format: string) => /reel|video|story|tiktok|short/i.test(format)
export const VIDEO_SCENES = 3

type PlanPost = PlanData['posts'][number]

export const visualsCost = (posts: Pick<PlanPost, 'format'>[], p: Pick<Prices, 'image'>) => {
  const videos = posts.filter((x) => isVideoFormat(x.format)).length
  return { images: posts.length - videos, videos, credits: (posts.length - videos + videos * VIDEO_SCENES) * p.image }
}

// A run that never reported back (server restart) stops counting after 30 minutes.
export const visualsRunning = (v: PlanData['visuals'], now = Date.now()) => v?.status === 'RUNNING' && now - Date.parse(v.startedAt) < 30 * 60_000

// The plan posts in the Planner that still have no picture or video.
export async function postsWithoutVisuals(planId: string) {
  const plan = await prisma.strategyPlan.findUnique({ where: { id: planId } })
  if (!plan) return []
  const data = plan.data as unknown as PlanData
  const ids = data.posts.map((p) => p.postId).filter((x): x is string => Boolean(x))
  const bare = await prisma.post.findMany({
    where: { id: { in: ids }, mediaIds: { isEmpty: true }, status: { in: ['DRAFT', 'SCHEDULED'] } },
    select: { id: true },
  })
  const set = new Set(bare.map((b) => b.id))
  return data.posts.filter((p) => p.postId && set.has(p.postId))
}

async function setStatus(planId: string, patch: Partial<NonNullable<PlanData['visuals']>>) {
  const plan = await prisma.strategyPlan.findUnique({ where: { id: planId } })
  if (!plan) return
  const data = plan.data as unknown as PlanData
  const visuals = { status: 'RUNNING' as const, total: 0, startedAt: new Date().toISOString(), outOfCredits: false, ...data.visuals, ...patch }
  await prisma.strategyPlan.update({ where: { id: planId }, data: { data: { ...data, visuals } as unknown as Prisma.InputJsonValue } })
}

export async function generatePlanVisuals(planId: string, price: number) {
  const plan = await prisma.strategyPlan.findUnique({
    where: { id: planId },
    include: { workspace: { include: { brandKit: true, account: { select: { id: true } } } } },
  })
  if (!plan?.workspace.account) return
  const ws = plan.workspace
  const accountId = ws.account!.id
  const todo = await postsWithoutVisuals(planId)
  const known = await withDossier(ws.brandKit, ws.id)
  const bg = ws.brandKit?.colors.find((c) => /^#[0-9a-fA-F]{6}$/.test(c)) ?? '#111827'
  let stop = false

  // One AI image, charged once it exists; null when it failed or credits ran out.
  const image = async (p: PlanPost, i: number, aspect: '1:1' | '9:16' | '4:5') => {
    if (stop) return null
    try {
      const img = await generateImage(ws.name, known, p.visual || p.caption.slice(0, 300), p.caption.slice(0, 1500), i, [], aspect)
      const media = await saveMedia(ws.id, img.data, img.mime, `Plan image: ${(p.visual || p.pillar).slice(0, 200)}`)
      const ok = await charge(accountId, ws.id, [{ amount: price, reason: 'AI_IMAGE', note: `Plan image: ${plan.title}`.slice(0, 200), action: 'image', units: 1 }])
      if (!ok) {
        stop = true
        return null
      }
      return media
    } catch (e) {
      noteAiFailure(e)
      console.error('plan image failed', p.postId, e instanceof Error ? e.message : e)
      return null
    }
  }

  const attach = (postId: string, mediaId: string) =>
    // Only if the post still has nothing (someone may have added a picture meanwhile).
    prisma.post.updateMany({ where: { id: postId, mediaIds: { isEmpty: true } }, data: { mediaIds: [mediaId] } })

  const one = async (p: PlanPost) => {
    if (stop || !p.postId) return
    if (!isVideoFormat(p.format)) {
      const m = await image(p, 0, p.network === 'INSTAGRAM' ? '4:5' : '1:1')
      if (m) await attach(p.postId, m.id)
      return
    }
    // A short Reel: a few AI images with motion, no on-screen text (open it in
    // Studio → Video to add text or voice and render again).
    const shots = []
    for (let i = 0; i < VIDEO_SCENES; i++) {
      const m = await image(p, i, '9:16')
      if (m) shots.push(m)
    }
    if (shots.length === 0) return
    const doc: VideoDoc = {
      ...emptyDoc(bg),
      endCard: false,
      scenes: shots.map((m, i) =>
        newScene(bg, { media: { id: m.id, kind: 'image', url: mediaUrl(m.id), durationMs: null, posterUrl: null }, duration: 3, motion: (['zoom-in', 'pan-right', 'zoom-out'] as const)[i % 3] }),
      ),
      caption: p.caption,
    }
    const video = await prisma.video.create({
      data: { workspaceId: ws.id, name: (p.pillar || 'Plan video').slice(0, 120), format: '9:16', data: doc as unknown as Prisma.InputJsonValue },
    })
    await enqueueRender(video.id, doc.scenes.map(() => null))
    await waitForRender(video.id)
    const done = await prisma.video.findUnique({ where: { id: video.id }, select: { status: true, outputMediaId: true } })
    if (done?.status === 'READY' && done.outputMediaId) await attach(p.postId, done.outputMediaId)
  }

  try {
    const queue = [...todo]
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        for (let p = queue.shift(); p; p = queue.shift()) await one(p)
      }),
    )
  } finally {
    await setStatus(planId, { status: 'DONE', outOfCredits: stop })
  }
}

export async function startPlanVisuals(planId: string, total: number) {
  await setStatus(planId, { status: 'RUNNING', total, startedAt: new Date().toISOString(), outOfCredits: false })
}
