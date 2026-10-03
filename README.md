# Loudpilot

AI marketing platform: social campaigns, AI photo/video content, paid-ads analytics and recommendations.
Used directly, or embedded into partner products (Upla, Zavnili, Dotcom…) through the API.

## Model

```
Partner (connected product, API key)
 ├─ mode SINGLE — the partner itself is one advertiser → one Workspace
 └─ mode MULTI  — reseller; each of its profiles is a Workspace (Upla: companies + brokers)

Workspace — one advertiser: brand kit, social/ad accounts, campaigns, content, analytics
Account   — who pays: created by signup, owns credits (CreditEntry ledger)
```

Money: the customer pays Loudpilot for credits directly; the partner gets `revenueSharePct` of purchases.
Ad budgets are paid by the customer to the ad network (Meta, TikTok…) — never through Loudpilot.

## Local setup

```bash
npm install
createdb khma
cp .env.example .env   # set DATABASE_URL and KHMA_ENCRYPTION_KEY (openssl rand -base64 32)
npm run db:migrate
npm run dev
```

Create a partner and an API key (printed once):

```bash
npm run partner:create -- upla "Upla" MULTI 20
```

## API v1

Server-to-server only. `Authorization: Bearer khma_…`. Errors: `{ "error": { "code", "message" } }`.
Partners address workspaces by **their own id** (`externalId`); a key only reaches its own partner's workspaces.

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/v1/ping` | Check the key |
| POST | `/api/v1/workspaces` | Upsert a workspace `{ externalId, name, locale? }` — call whenever a profile opens Marketing |
| GET  | `/api/v1/workspaces` | List the partner's workspaces |
| GET  | `/api/v1/workspaces/:externalId` | Workspace + registration state + balance |
| POST | `/api/v1/workspaces/:externalId/signup` | Short registration `{ name, email, country?, currency?, acceptTerms: true }` — required before buying/spending credits |
| GET  | `/api/v1/workspaces/:externalId/credits` | Balance + last 50 ledger entries |
