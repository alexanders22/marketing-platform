import type { Account, Workspace } from '@prisma/client'

// Public shape returned to partners. Internal ids stay internal; partners
// address workspaces by their own externalId.
export function serializeWorkspace(ws: Workspace & { account: Account | null }) {
  return {
    externalId: ws.externalId,
    name: ws.name,
    locale: ws.locale,
    registered: ws.account !== null,
    account: ws.account && {
      name: ws.account.name,
      email: ws.account.email,
      currency: ws.account.currency,
      creditBalance: ws.account.creditBalance,
    },
    createdAt: ws.createdAt,
  }
}
