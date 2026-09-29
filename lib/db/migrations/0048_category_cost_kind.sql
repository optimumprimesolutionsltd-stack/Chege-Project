-- What kind of cost a category linked to an income stream is, on that
-- business's profit and loss.
--
-- "cogs": cost of goods sold, what the things sold cost - stock, or fuel for a
-- generator. Comes off sales first, giving gross profit.
-- "expense": the cost of running the business - repairs, a stall's rent,
-- transport. Comes off gross profit, giving net profit.
--
-- Every link made before this was treated as a cost of goods sold, so that is
-- the default and nothing reads differently until somebody chooses otherwise.
-- The server also adds this column itself before it serves a request (see
-- index.ts), since every category query selects it; this records it.

ALTER TABLE "budget_categories" ADD COLUMN IF NOT EXISTS "cost_kind" text NOT NULL DEFAULT 'cogs';
