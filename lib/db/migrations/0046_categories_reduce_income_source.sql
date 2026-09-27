-- A category can name the income source it is a cost of earning — stock
-- bought for a side hustle sold through M-Pesa, say — so its spending can be
-- worked out of that income stream's profit instead of only ever being one
-- more cost against the whole budget.
--
-- Nullable and one-directional: an income source does not point back, and
-- almost every category has nothing to do with earning one, so it stays
-- null. Set null (not restricted) when the income source it named is
-- deleted, the same as any other soft link here — the category itself is
-- still a perfectly good category, it just stops reducing anything.

ALTER TABLE "budget_categories"
  ADD COLUMN IF NOT EXISTS "reduces_income_source_id" integer REFERENCES "income_sources"("id") ON DELETE SET NULL;
