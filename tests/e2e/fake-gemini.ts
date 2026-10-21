import { createServer, type Server } from 'node:http'

// A scripted stand-in for Gemini's generateContent, for the website
// assistant. The dev server uses it with GEMINI_API_KEY=fake and
// GEMINI_BASE_URL=http://127.0.0.1:18992 (non-production only).
//   "manager" / "person"           → handoff_to_human
//   "order X-123 … someone@mail"   → lookup_order_status
//   "my orders"                    → lookup_my_orders (only when offered)
//   a long number                  → save_contact
//   a tool result                  → a sentence quoting it
//   JSON wanted (set-up)           → a ready brief
//   anything else                  → "We deliver across Tbilisi within 2 hours."

export const FAKE_GEMINI_PORT = 18992

type Part = { text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }
type Body = {
  contents: { role: string; parts: Part[] }[]
  tools?: { functionDeclarations?: { name: string }[] }[]
  generationConfig?: { responseMimeType?: string }
}

export function startFakeGemini() {
  const requests: Body[] = []
  const server: Server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const reply = (parts: Part[]) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP', index: 0 }] }))
    }
    if (!req.url?.includes(':generateContent')) {
      res.writeHead(404)
      return res.end()
    }
    const body = JSON.parse(raw) as Body
    requests.push(body)
    const tools = body.tools?.flatMap((t) => t.functionDeclarations?.map((f) => f.name) ?? []) ?? []
    const call = (name: string, args: Record<string, unknown>) => reply([{ functionCall: { name, args } }])

    if (body.generationConfig?.responseMimeType === 'application/json')
      return reply([
        {
          text: JSON.stringify({
            instructions: 'You are the assistant of Bloom & Co., a flower shop in Tbilisi.',
            knowledge: '- Delivery in Tbilisi within 2 hours\n- Open 9:00–21:00',
            greeting: 'Hi! Looking for flowers?',
            redFlags: ['refund', 'complaint'],
          }),
        },
      ])

    const last = body.contents.at(-1)!
    const result = last.parts.find((p) => p.functionResponse)?.functionResponse
    if (result) {
      if (result.name === 'handoff_to_human') return reply([{ text: 'I passed this to my colleagues — they will answer here.' }])
      if (result.name === 'save_contact') return reply([{ text: 'Thanks, we saved your number.' }])
      return reply([{ text: `Here is what I found: ${JSON.stringify(result.response)}` }])
    }
    const text = last.parts.map((p) => p.text ?? '').join(' ')
    if (/manager|person/i.test(text)) return call('handoff_to_human', { reason: 'asked for a person', summary: text })
    const order = text.match(/order\s+([A-Z]-\d+)/i)
    const email = text.match(/\S+@\S+\.\w+/)
    if (order && email && tools.includes('lookup_order_status')) return call('lookup_order_status', { order_number: order[1], email_or_phone: email[0] })
    if (/my orders/i.test(text) && tools.includes('lookup_my_orders')) return call('lookup_my_orders', {})
    const phone = text.match(/\+?\d{9,}/)
    if (phone) return call('save_contact', { phone: phone[0] })
    return reply([{ text: 'We deliver across Tbilisi within 2 hours.' }])
  })
  return {
    requests,
    listen: () => new Promise<void>((r) => server.listen(FAKE_GEMINI_PORT, '127.0.0.1', () => r())),
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}
