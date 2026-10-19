import { monremEnabled, validCallback, type MonremTx } from '@/lib/monrem'
import { applyStatus } from '@/lib/payments'

// Monrem's callback (IPN): the transaction object, sent on every status
// change. Trusted only with a valid integrity hash; answered 200 so Monrem
// stops retrying once it is applied.
export async function POST(req: Request) {
  if (!monremEnabled()) return new Response('Not configured', { status: 404 })
  const type = req.headers.get('content-type') ?? ''
  const raw = await req.text()
  let tx: Partial<MonremTx>
  try {
    tx = type.includes('application/x-www-form-urlencoded') ? (Object.fromEntries(new URLSearchParams(raw)) as unknown as Partial<MonremTx>) : (JSON.parse(raw) as Partial<MonremTx>)
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!validCallback(tx)) return new Response('Invalid signature', { status: 401 })
  const payment = await applyStatus({ ...(tx as MonremTx), amount: Number(tx.amount) })
  return Response.json({ ok: true, known: Boolean(payment) })
}
