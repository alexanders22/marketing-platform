-- Credit packs cost more per credit than any plan (src/lib/pricing.ts): the
-- packs and top-up credit price saved in Admin → Pricing give way to the new
-- defaults; plans and action prices stay as saved.
UPDATE "Setting" SET "value" = "value" - 'packs' - 'creditPriceUsd' WHERE "key" = 'pricing';
