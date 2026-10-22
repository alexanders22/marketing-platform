-- Three plans: Start (STARTER), Business (TEAM), Agency (AGENCY), new prices
-- and unlimited users. SOLO is retired: its accounts and subscriptions move
-- to STARTER.
UPDATE "Account" SET "plan" = 'STARTER' WHERE "plan" = 'SOLO';
UPDATE "Subscription" SET "plan" = 'STARTER' WHERE "plan" = 'SOLO';

-- Plan prices and Veo seconds saved in Admin → Pricing give way to the new
-- defaults (src/lib/plans.ts, src/lib/pricing.ts); action prices and credit
-- packs stay as saved.
UPDATE "Setting" SET "value" = "value" - 'plans' - 'veoSecondsPerMonth' WHERE "key" = 'pricing';
