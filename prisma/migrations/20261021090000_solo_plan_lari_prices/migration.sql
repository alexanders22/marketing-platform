-- AlterEnum
ALTER TYPE "Plan" ADD VALUE 'SOLO' BEFORE 'STARTER';

-- New prices: credits per action, plans with lari prices, credit packs and
-- Veo seconds (defaults in src/lib/pricing.ts and src/lib/plans.ts). The
-- prices saved in Admin → Pricing give way to them; edit them there after.
DELETE FROM "Setting" WHERE "key" = 'pricing';
