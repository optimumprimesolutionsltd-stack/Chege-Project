---
name: Schema push safety
description: How to handle development-schema changes when Drizzle detects unrelated database drift.
---

When the schema push tool proposes truncating a populated table to reconcile an unrelated constraint, do not use its force mode for a small additive change. Inspect the proposed action and apply only the narrowly scoped, non-destructive development DDL needed for the intended schema change.

**Why:** Schema drift can make a normal sync combine a safe new column with an unrelated destructive reconciliation. Forcing that batch risks deleting working financial data.

**How to apply:** Prefer the normal push when it is non-destructive. If it requests a truncation, stop, preserve existing data, and use the database tooling to apply a reviewed additive migration only. Production schema changes continue through the Publish flow.

For first-time workspace failures, also compare the application model with the live development table before blaming authentication. A missing additive workspace field can surface as a generic server error only when the first Personal budget is created.

If Publish proposes dropping populated production tables that the current schema still defines, compare development and production before approving. Restore missing development tables with their reviewed additive migrations, then cancel the stale publish attempt and start a fresh one so Replit recalculates the diff.