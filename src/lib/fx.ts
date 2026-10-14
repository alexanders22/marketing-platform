import 'server-only'

// Lari per US dollar: the official rate of the National Bank of Georgia,
// read at most every 6 hours. If it can't be read, the last known rate (or a
// fallback) is used and it is tried again within the hour.
const NBG = 'https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?currencies=USD'
const FALLBACK = 2.7
const FRESH = 6 * 3_600_000
const RETRY = 3_600_000

const g = globalThis as { __khmaFx?: { at: number; rate: number; ok: boolean } }

export async function gelPerUsd(): Promise<number> {
  const c = g.__khmaFx
  if (c && Date.now() - c.at < (c.ok ? FRESH : RETRY)) return c.rate
  try {
    const res = await fetch(NBG, { signal: AbortSignal.timeout(4000) })
    const data = (await res.json()) as { currencies?: { code: string; rate: number }[] }[]
    const rate = Number(data?.[0]?.currencies?.find((x) => x.code === 'USD')?.rate)
    if (!(rate > 1 && rate < 10)) throw new Error('bad rate')
    g.__khmaFx = { at: Date.now(), rate, ok: true }
  } catch {
    g.__khmaFx = { at: Date.now(), rate: c?.rate ?? FALLBACK, ok: false }
  }
  return g.__khmaFx.rate
}
