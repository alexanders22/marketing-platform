@AGENTS.md

# Loudpilot (formerly Khma)

AI marketing platform (Ocoya-like + paid ads + analytics). Partners (Upla, Zavnili, Dotcom) integrate via `/api/v1` with a partner API key; see README for the model (Partner → Workspace, Account → credits).

- Stack: Next.js 16 (App Router, read `node_modules/next/dist/docs/` before using APIs), Prisma 7 + Postgres (`@prisma/adapter-pg`), zod 4, Tailwind 4.
- Every partner route: `requirePartner(req)` then `partnerWorkspace(partner, externalId)` — never look a workspace up by internal id from partner input.
- Third-party tokens: store only via `encrypt()` from `src/lib/crypto.ts`. API keys: store only the sha256 hash.
- Credits: every change is a `CreditEntry` with an `idempotencyKey`, and `Account.creditBalance` is updated in the same transaction.
- Dev server: port 3100.
- Internal names keep the old "khma" (DB, cookies, env vars KHMA_*); everything users and partners see says Loudpilot (loudpilot.app).
