-- Merry-go-round: a rotating payout for a shared budget.
--
-- Each round the pot is disbursed to one member in turn. The treasurer picks
-- who, so nothing here stores a fixed rotation — this table is simply the
-- record of who has received and in what order. Recording a payout also
-- writes a joint-account disbursement, so the bank balance and this history
-- move together.
--
-- Off by default and opt-in per budget (merry_go_round_enabled on groups),
-- because it is a chama practice and would only clutter a church or a
-- household. Purely additive; every existing read keeps working.

ALTER TABLE "groups"
	ADD COLUMN IF NOT EXISTS "merry_go_round_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "group_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"contributor_id" integer NOT NULL,
	-- The bank disbursement this payout created. Null only if the money was
	-- recorded without moving through the joint account.
	"transaction_id" integer,
	-- 1-based, assigned in order per group.
	"round_number" integer NOT NULL,
	"amount" integer NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"recorded_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "group_payouts"
		ADD CONSTRAINT "group_payouts_group_id_groups_id_fk"
		FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "group_payouts"
		ADD CONSTRAINT "group_payouts_contributor_id_group_contributors_id_fk"
		FOREIGN KEY ("contributor_id") REFERENCES "public"."group_contributors"("id") ON DELETE restrict;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "group_payouts"
		ADD CONSTRAINT "group_payouts_transaction_id_joint_account_transactions_id_fk"
		FOREIGN KEY ("transaction_id") REFERENCES "public"."joint_account_transactions"("id") ON DELETE set null;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "group_payouts_group_round_idx"
	ON "group_payouts" ("group_id", "round_number");
--> statement-breakpoint

-- One record per round per group: recording round 4 twice is a mistake, not a
-- correction.
CREATE UNIQUE INDEX IF NOT EXISTS "group_payouts_group_round_unique"
	ON "group_payouts" ("group_id", "round_number");
