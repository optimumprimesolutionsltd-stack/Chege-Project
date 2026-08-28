CREATE TABLE "bank_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "group_id" integer NOT NULL,
  "name" text NOT NULL,
  "opening_balance" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "bank_accounts_group_name_unique" UNIQUE("group_id","name")
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "bank_accounts_group_id_idx" ON "bank_accounts" USING btree ("group_id");
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "account_id" integer;
--> statement-breakpoint
ALTER TABLE "expense_income_splits" ADD COLUMN "account_id" integer;
--> statement-breakpoint
ALTER TABLE "joint_account_transactions" ADD COLUMN "account_id" integer;
--> statement-breakpoint
ALTER TABLE "savings_goal_contributions" ADD COLUMN "account_id" integer;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expense_income_splits" ADD CONSTRAINT "expense_income_splits_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "joint_account_transactions" ADD CONSTRAINT "joint_account_transactions_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "savings_goal_contributions" ADD CONSTRAINT "savings_goal_contributions_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "bank_accounts" ("group_id", "name", "opening_balance")
SELECT "id", 'Main account', "bank_opening_balance"
FROM "groups";
--> statement-breakpoint
UPDATE "joint_account_transactions" AS "transaction"
SET "account_id" = "account"."id"
FROM "bank_accounts" AS "account"
WHERE "account"."group_id" = "transaction"."group_id" AND "account"."name" = 'Main account';
--> statement-breakpoint
UPDATE "expenses" AS "expense"
SET "account_id" = "account"."id"
FROM "bank_accounts" AS "account"
WHERE "expense"."paid_from_bank" = true
  AND "account"."group_id" = "expense"."group_id" AND "account"."name" = 'Main account';
--> statement-breakpoint
UPDATE "expense_income_splits" AS "split"
SET "account_id" = "account"."id"
FROM "bank_accounts" AS "account"
WHERE "split"."from_bank" = true
  AND "account"."group_id" = "split"."group_id" AND "account"."name" = 'Main account';
--> statement-breakpoint
UPDATE "savings_goal_contributions" AS "contribution"
SET "account_id" = "transaction"."account_id"
FROM "joint_account_transactions" AS "transaction"
WHERE "contribution"."bank_transaction_id" = "transaction"."id";