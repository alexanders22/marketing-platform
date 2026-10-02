import { handler, json, requirePartner } from '@/lib/api'

// Lets a partner check its key and see how Khma sees it.
export const GET = handler(async (req) => {
  const partner = await requirePartner(req)
  return json({ partner: { name: partner.name, slug: partner.slug, mode: partner.mode } })
})
