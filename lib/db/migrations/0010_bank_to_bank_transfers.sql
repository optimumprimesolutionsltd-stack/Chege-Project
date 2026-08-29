ALTER TABLE "joint_account_transactions"
  ADD COLUMN "bank_transfer_id" text,
  ADD COLUMN "bank_transfer_account_id" integer;

ALTER TABLE "joint_account_transactions"
  ADD CONSTRAINT "joint_account_transactions_bank_transfer_account_id_bank_accounts_id_fk"
  FOREIGN KEY ("bank_transfer_account_id") REFERENCES "public"."bank_accounts"("id")
  ON DELETE restrict ON UPDATE no action;

CREATE INDEX "joint_account_transactions_bank_transfer_idx"
  ON "joint_account_transactions" USING btree ("group_id", "bank_transfer_id");