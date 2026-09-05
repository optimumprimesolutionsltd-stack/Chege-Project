-- Sub-categories: the mini-ledger inside a budget category.
--
-- Groceries is not one purchase a month, it is thirty. Wi-Fi, garbage,
-- security and school trips are the same shape: a running tally that belongs
-- underneath something bigger rather than beside it.
--
-- The parent keeps its budget figure. A child's budget_amount is a target
-- within that and may be 0, meaning "track this, do not judge it". Spending is
-- unaffected either way — it comes from the expenses tagged to a category, not
-- from this column — so a child with no target still reports month on month.
--
-- Purely additive. Every existing category has parent_id NULL and behaves
-- exactly as before.

ALTER TABLE "budget_categories"
	ADD COLUMN IF NOT EXISTS "parent_id" integer;
--> statement-breakpoint

-- Restricted, not cascading. Deleting Utilities must not silently take Wi-Fi,
-- Garbage and Security with it, along with the only record of what they cost.
DO $$ BEGIN
	ALTER TABLE "budget_categories"
		ADD CONSTRAINT "budget_categories_parent_id_budget_categories_id_fk"
		FOREIGN KEY ("parent_id") REFERENCES "public"."budget_categories"("id")
		ON DELETE restrict ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- One level only is enforced in the route, where it can be explained. This
-- catches the case no message helps with.
DO $$ BEGIN
	ALTER TABLE "budget_categories"
		ADD CONSTRAINT "budget_categories_parent_not_self_check"
		CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "budget_categories_parent_idx"
	ON "budget_categories" USING btree ("parent_id");
