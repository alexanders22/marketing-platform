import 'server-only'

// Public endpoints read the body before they know who is calling: a few
// huge POSTs at once must not fill the memory. Refused by Content-Length
// first, then the stream is read up to the cap and dropped past it.
export const BODY_LIMIT = 64 * 1024

// The body as text, or null when it is larger than `maxBytes` (answer 413).
export async function readBody(req: Request, maxBytes = BODY_LIMIT): Promise<string | null> {
  const declared = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) {
    await req.body?.cancel().catch(() => {})
    return null
  }
  const reader = req.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export const tooLarge = (headers: Record<string, string> = {}) => new Response('Request body too large', { status: 413, headers })
