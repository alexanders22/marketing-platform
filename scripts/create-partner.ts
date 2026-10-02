// Creates (or reuses) a partner and issues a new API key.
// Usage: npx tsx scripts/create-partner.ts <slug> "<Name>" <SINGLE|MULTI> [revenueSharePct]
// The key is printed once; only its hash is stored.
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { generateApiKey } from '../src/lib/crypto'

async function main() {
  const [slug, name, mode = 'SINGLE', share = '0'] = process.argv.slice(2)
  if (!slug || !name || !['SINGLE', 'MULTI'].includes(mode)) {
    console.error('Usage: npx tsx scripts/create-partner.ts <slug> "<Name>" <SINGLE|MULTI> [revenueSharePct]')
    process.exit(1)
  }

  const partner = await prisma.partner.upsert({
    where: { slug },
    create: { slug, name, mode: mode as 'SINGLE' | 'MULTI', revenueSharePct: Number(share) },
    update: {},
  })
  const { key, prefix, keyHash } = generateApiKey()
  await prisma.apiKey.create({ data: { partnerId: partner.id, name: 'default', prefix, keyHash } })

  console.log(`Partner: ${partner.name} (${partner.slug}, ${partner.mode})`)
  console.log(`API key (store it now, it will not be shown again):\n${key}`)
}

main().finally(() => prisma.$disconnect())
