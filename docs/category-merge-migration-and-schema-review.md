# Jamvi category merge migration and Drizzle schema review

**Status:** Draft for production review. Do not run directly against production until the database backup, dry run, row counts, and rollback plan have been approved.

I am an AI, not a licensed financial advisor; this is engineering analysis for a financial-data system, not a guarantee about the outcome of a production data change. A database owner or senior engineer should review the migration against a restored production backup before execution.

## Executive conclusion

Chege-Project uses **Drizzle ORM with PostgreSQL**, not Prisma. The backend recommendation source, `artifacts/api-server/src/lib/categoryPacks.ts`, already contains canonical names such as `Food`, `Housing`, and `Education`; it does not seed separate `Rent` or `Accommodation` categories.

The current database schema stores `budget_categories.name` as unconstrained text and has a case-sensitive unique key on `(group_id, name)`. That prevents exact duplicates but allows variants such as `Rent`, ` rent `, and `RENT` to coexist. The schema should enforce **non-blank bounded names** and **case/whitespace-normalized uniqueness per workspace**, but it should not enforce a closed enum of category names because Jamvi supports custom categories.

The supplied forward migration is intentionally kept under `scripts/manual-migrations/` rather than being registered in Drizzle’s automatic migration journal. It takes a persistent backup of affected rows, acquires a transaction-scoped advisory lock, updates expenses and split allocations to `Housing`, repoints budget-plan category foreign keys, merges duplicate planned amounts, removes duplicate category master rows, and canonicalizes legacy onboarding records. The companion rollback restores backed-up rows by their original primary keys.

## Files

| File | Purpose |
|---|---|
| `scripts/manual-migrations/0015_merge_rent_accommodation_into_housing.sql` | Forward data migration. |
| `scripts/manual-migrations/rollback_0015_merge_rent_accommodation_into_housing.sql` | Manual rollback from the forward migration’s persistent backups. |
| `lib/db/src/schema/budget.ts` | Current Drizzle budget-category schema reviewed. |
| `lib/db/src/schema/budget-plans.ts` | Budget-plan and onboarding category relationships reviewed. |

## What the forward migration changes

The merge is workspace-scoped. For each workspace, an existing `Housing` row is preferred as the survivor. If no `Housing` row exists, the lowest-ID `Rent` or `Accommodation` row becomes the survivor and is renamed to `Housing`. The migration never combines rows across workspaces, and it leaves categories with a `NULL` `group_id` out of the survivor map.

Historical expense records retain their IDs and amounts. Their category labels are changed from `Rent` or `Accommodation` to `Housing` in `expenses`, `expense_category_allocations`, and `joint_account_transactions.expense_category`.

If a budget plan contains both `Rent` and `Accommodation` (or `Housing` plus one of those aliases), the migration keeps one `budget_plan_categories` row, sums the `planned_amount` values, keeps the earliest priority and position, keeps `is_custom = true` if any merged row was custom, and repoints `budget_category_id` to the survivor. This avoids violating the plan-level unique index on `(budget_plan_id, category_name)`.

Legacy onboarding selections and planned allocations are similarly deduplicated. Onboarding JSON category arrays are rewritten in first-seen order with the aliases represented by one `Housing` value.

## Production runbook

The migration is **not executable in this sandbox** because no production `DATABASE_URL` or PostgreSQL client is configured. It has been checked for balanced transaction structure, explicit affected-row predicates, and repository formatting, but it has not been executed against a live or restored database.

Before execution, take a verified database backup and restore it into a staging database. Run the forward SQL there, then verify the following invariants:

| Verification | Expected result |
|---|---|
| Rows with `lower(btrim(category)) IN ('rent', 'accommodation')` in `expenses` | `0` |
| Rows with the same aliases in split allocations and joint transactions | `0` |
| Category master rows named `Rent` or `Accommodation` | `0` for non-archived and archived rows alike, unless deliberately excluded by policy |
| Duplicate normalized category names per workspace | `0` |
| Sum of expense amounts before and after | Unchanged |
| Sum of planned amounts by plan before and after | Unchanged, except that duplicate alias rows are intentionally summed into `Housing` |
| Number of expense, allocation, and ledger rows | Unchanged |
| Foreign-key checks | No new violations |

After staging verification, stop or quiesce category and budget-plan writes, run the migration in one session, capture the backup-table row counts, and rerun the invariant queries. Keep the `jamvi_0015_backup_*` tables until the post-deployment observation window has completed. The rollback script is a manual recovery tool; it should not be run concurrently with application writes.

## Drizzle schema recommendation

The current schema should be strengthened in a separate reviewed schema migration. PostgreSQL `CHECK` constraints are appropriate for simple row validity, while unique indexes can enforce normalized uniqueness at insert/update time [1] [2]. Drizzle supports indexes and constraints in table definitions, including SQL expressions for PostgreSQL indexes [3].

Recommended logical constraints for `budget_categories` are:

```ts
import { check, index, sql, uniqueIndex } from "drizzle-orm/pg-core";

// Inside the budgetCategoriesTable table callback:
check(
  "budget_categories_name_valid_check",
  sql`btrim(${table.name}) <> '' AND char_length(${table.name}) <= 80`,
),
uniqueIndex("budget_categories_group_name_normalized_unique")
  .on(table.groupId, sql`lower(btrim(${table.name}))`),
```

The existing column-based unique definition on `(groupId, name)` should be replaced by the normalized unique index after all existing duplicates have been cleaned. The migration that adds the new index should first run a duplicate-detection query and fail review if any normalized duplicates remain. If `NULL` workspaces are permitted, confirm the desired PostgreSQL `NULL` behavior; otherwise add a separate rule requiring every persisted category to belong to a workspace.

The database should **not** enforce an enum containing only `Food`, `Housing`, `Education`, and similar recommendations. Jamvi explicitly allows user-created categories, and a database whitelist would make legitimate custom categories impossible without another schema change. Semantic aliasing such as `Rent` → `Housing` belongs in the shared application/domain normalization helper, while the database should enforce the invariants it can express reliably: non-blank bounded names and normalized uniqueness within a workspace.

## Important limitation

The migration safely consolidates legacy category records only for aliases represented in its mapping: `Rent` and `Accommodation` become `Housing`. It does not silently merge unrelated categories such as `Food` and `Groceries`, because those may represent distinct spending concepts in existing financial history. Any additional semantic merges should be separately approved and modeled with the same backup, reconciliation, and rollback discipline.

## References

[1]: https://www.postgresql.org/docs/current/ddl-constraints.html "PostgreSQL 18 Documentation — Constraints"

[2]: https://www.postgresql.org/docs/current/sql-createindex.html "PostgreSQL 18 Documentation — CREATE INDEX"

[3]: https://orm.drizzle.team/docs/indexes-constraints "Drizzle ORM Documentation — Indexes & Constraints"
