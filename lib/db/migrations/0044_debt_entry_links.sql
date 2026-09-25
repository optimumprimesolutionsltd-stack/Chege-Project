-- Which person a debt entry was for.
--
-- Saving a payment as "paying back what I owe", or money in as "I borrowed this",
-- changes a person's balance, but that is offered and applied separately, and the
-- entry itself never said whose. So deleting one could not say whose balance to
-- put back, and the person had to be corrected by hand.
--
-- A side table rather than a column on joint_account_transactions on purpose. The
-- columns that name a person there (settles_contributor_id) already mean things to
-- the dashboard and the reports: a borrowed deposit carrying one would be counted
-- as money repaid to us. A new table changes no existing figure, and if it is ever
-- missing only the code that reads it fails, never an ordinary bank entry.
--
-- The kind is stored, not worked out, so reversing an entry never has to guess.
-- Deleting the entry removes its link. Nothing is backfilled: entries saved before
-- this have no link, and guessing one would move the wrong person's balance.

CREATE TABLE IF NOT EXISTS "debt_entry_links" (
  "transaction_id" integer PRIMARY KEY
    REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
  "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "party_id" integer NOT NULL REFERENCES "group_contributors"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "debt_entry_links_kind_check"
    CHECK ("kind" IN ('pay-back', 'lend', 'repaid', 'borrowed'))
);

CREATE INDEX IF NOT EXISTS "debt_entry_links_group_idx"
  ON "debt_entry_links" ("group_id", "party_id");
