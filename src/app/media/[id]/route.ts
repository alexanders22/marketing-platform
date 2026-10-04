import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { NextRequest } from 'next/server'
import { validMediaSignature } from '@/lib/media-url'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/session'
import { mediaFile } from '@/lib/storage'

// Private media: only members of the account that owns the workspace — or
// anyone holding a short-lived signed link (used when a network fetches the
// file to publish it). Streams from disk with Range support so videos seek.
export async function GET(req: NextRequest, ctx: RouteContext<'/media/[id]'>) {
  const { id } = await ctx.params
  const signed = validMediaSignature(id, req.nextUrl.searchParams.get('exp'), req.nextUrl.searchParams.get('sig'))

  let media
  if (signed) {
    media = await prisma.media.findUnique({ where: { id } })
  } else {
    const user = await getSessionUser()
    if (!user) return new Response('Not found', { status: 404 })
    media = await prisma.media.findFirst({
      where: { id, workspace: { account: { members: { some: { userId: user.id } } } } },
    })
  }
  if (!media) return new Response('Not found', { status: 404 })

  const file = mediaFile(media.path)
  const { size } = await stat(file).catch(() => ({ size: -1 }))
  if (size < 0) return new Response('Not found', { status: 404 })
  const headers: Record<string, string> = {
    'content-type': media.mime,
    'accept-ranges': 'bytes',
    'cache-control': signed ? 'public, max-age=300' : 'private, max-age=31536000, immutable',
    'content-disposition': `inline; filename="loudpilot-${media.id}.${media.path.split('.').pop() ?? 'bin'}"`,
  }

  const range = req.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/)
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2])
    let end = range[1] && range[2] ? Number(range[2]) : size - 1
    start = Math.max(0, start)
    end = Math.min(end, size - 1)
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
    const body = fileStream(file, { start, end })
    return new Response(body, {
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) },
    })
  }
  const body = fileStream(file)
  return new Response(body, { headers: { ...headers, 'content-length': String(size) } })
}

// A file as a web stream that reads only as fast as the client takes it and
// stops quietly when the client goes away (players abort while seeking).
function fileStream(file: string, range?: { start: number; end: number }) {
  const node = createReadStream(file, range)
  let done = false
  return new ReadableStream<Uint8Array>({
    start(controller) {
      node.on('data', (chunk) => {
        if (done) return
        try {
          controller.enqueue(new Uint8Array(chunk as Buffer))
          if ((controller.desiredSize ?? 1) <= 0) node.pause()
        } catch {
          done = true
          node.destroy()
        }
      })
      node.on('end', () => {
        if (done) return
        done = true
        try {
          controller.close()
        } catch {}
      })
      node.on('error', (e) => {
        if (done) return
        done = true
        try {
          controller.error(e)
        } catch {}
      })
    },
    pull() {
      node.resume()
    },
    cancel() {
      done = true
      node.destroy()
    },
  }, { highWaterMark: 4 })
}
