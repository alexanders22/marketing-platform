import type { Metadata } from 'next'
import { requireContext } from '@/lib/context'
import { siteUrl } from '@/lib/hosts'
import { prisma } from '@/lib/prisma'
import { ensureSite, hmac, previewToken, siteSecret } from '@/lib/tag'
import { DemoShop } from './DemoShop'

export const metadata: Metadata = { title: 'Demo shop — Loudpilot Tag', robots: { index: false } }

// A pretend storefront with the company's own Loudpilot Tag (test mode):
// click around, buy, leave a contact, sign in as a customer and talk to the
// assistant — then see it all on Website → Loudpilot Tag and Inbox → Website
// chat. Its visits are marked as tests and stay out of the reports.
const DEMO_CUSTOMER = 'loudpilot-demo-customer'

export default async function DemoShopPage() {
  const { workspace } = await requireContext()
  const site = await ensureSite(workspace.id)
  const bot = await prisma.chatBot.findUnique({ where: { workspaceId: workspace.id } })
  return (
    <>
      <script async src={`${siteUrl()}/t.js`} data-site={site.key} data-test="1" data-preview={previewToken(site.id)} />
      <DemoShop
        company={workspace.name}
        chat={bot ? (bot.enabled ? 'on' : 'preview') : 'none'}
        customer={{ user_id: DEMO_CUSTOMER, user_hash: hmac(siteSecret(site), DEMO_CUSTOMER) }}
      />
    </>
  )
}
