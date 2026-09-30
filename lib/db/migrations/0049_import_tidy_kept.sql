-- Imported entries somebody chose to leave as they are when Bank offered to
-- tidy them.
--
-- Bank offers to move imported M-Pesa charges into M-Pesa charges and to put
-- imported payments down to the importer. It can be wrong - an import once
-- linked a KES 9,714 payment to another as its charge - and a person who moved
-- it out was asked again every time. Leaving it as it is records it here, so
-- it is never offered again, on any device.
--
-- A side table, like reversal_links, so that if it is ever missing only the
-- tidy offer is affected, never an ordinary bank entry. Deleting the entry
-- removes the choice. The server also creates this itself after it starts
-- (lib/import-tidy-kept.ts); this records it.

CREATE TABLE IF NOT EXISTS "import_tidy_kept" (
  "transaction_id" integer PRIMARY KEY
    REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
  "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "import_tidy_kept_group_idx"
  ON "import_tidy_kept" ("group_id");
