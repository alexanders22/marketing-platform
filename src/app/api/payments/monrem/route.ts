import { monremEnabled, validCallback, type MonremTx } from '@/lib/monrem'
import { applyCallback } from '@/lib/payments'
import { readBody, tooLarge } from '@/lib/read-body'

// Monrem's callback (IPN): the transaction object, sent on every status
// change. It needs a valid integrity hash, and is then confirmed with
// Monrem's API before anything is booked; answered 200 once applied, 503 when
// Monrem can't be asked (so it is retried).
export async function POST(req: Request) {
  if (!monremEnabled()) return new Response('Not configured', { status: 404 })
  const type = req.headers.get('content-type') ?? ''
  // A transaction object is a few hundred bytes.
  const raw = await readBody(req, 32 * 1024)
  if (raw === null) return tooLarge()
  let tx: Partial<MonremTx>
  try {
    tx = type.includes('application/x-www-form-urlencoded') ? (Object.fromEntries(new URLSearchParams(raw)) as unknown as Partial<MonremTx>) : (JSON.parse(raw) as Partial<MonremTx>)
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!validCallback(tx)) return new Response('Invalid signature', { status: 401 })
  try {
    const payment = await applyCallback({ ...(tx as MonremTx), amount: Number(tx.amount) })
    return Response.json({ ok: true, known: Boolean(payment) })
  } catch (e) {
    console.error('monrem callback not confirmed', tx.order_id, e instanceof Error ? e.message : e)
    return new Response('Try again later', { status: 503 })
  }
}
