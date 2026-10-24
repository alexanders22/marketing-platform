import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

// scrypt with a per-password salt. Stored as "scrypt$ln=17,r=8,p=1$<salt b64>$<hash b64>"
// (N = 2^ln); hashes from before that carry no parameters and used N = 2^14.
const KEYLEN = 64
const CURRENT = { ln: 17, r: 8, p: 1 }
const LEGACY = { ln: 14, r: 8, p: 1 }
type Params = typeof CURRENT

// Same parameters as a real hash, so a login for an unknown email takes as long.
export const DUMMY_HASH = `scrypt$ln=${CURRENT.ln},r=${CURRENT.r},p=${CURRENT.p}$AAAA$AAAA`

function derive(password: string, salt: Buffer, { ln, r, p }: Params): Promise<Buffer> {
  const N = 2 ** ln
  return new Promise((resolve, reject) =>
    // scrypt needs 128·N·r bytes; Node's default cap (32 MiB) is below that for N = 2^17.
    scrypt(password, salt, KEYLEN, { N, r, p, maxmem: 256 * N * r }, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

function parse(stored: string) {
  const parts = stored.split('$')
  if (parts[0] !== 'scrypt') return null
  if (parts.length === 3) return { params: LEGACY, salt: parts[1], hash: parts[2] }
  const m = parts.length === 4 && /^ln=(\d+),r=(\d+),p=(\d+)$/.exec(parts[1])
  if (!m) return null
  const params = { ln: Number(m[1]), r: Number(m[2]), p: Number(m[3]) }
  // Bounds keep a bad row from tying up the server.
  if (params.ln < 14 || params.ln > 20 || params.r < 1 || params.r > 16 || params.p < 1 || params.p > 4) return null
  return { params, salt: parts[2], hash: parts[3] }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, CURRENT)
  return `scrypt$ln=${CURRENT.ln},r=${CURRENT.r},p=${CURRENT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const h = stored ? parse(stored) : null
  if (!h || !h.salt || !h.hash) return false
  const expected = Buffer.from(h.hash, 'base64')
  const actual = await derive(password, Buffer.from(h.salt, 'base64'), h.params)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// True for a hash made with weaker parameters than today's: rehash it once
// the password is known (on a successful login).
export function needsRehash(stored: string) {
  const h = parse(stored)
  return !h || h.params.ln < CURRENT.ln || h.params.r !== CURRENT.r || h.params.p !== CURRENT.p
}
