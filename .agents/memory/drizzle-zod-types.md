---
name: Drizzle Zod schema types
description: How to avoid the workspace's incompatible Zod type packages in database schema declarations.
---

Use Drizzle's native `$inferInsert` type for database insert types instead of
`z.infer<typeof createInsertSchema(...)>` in shared schema files.

**Why:** `drizzle-zod` and the workspace's direct Zod import can resolve to
incompatible type-package versions even when their runtime schemas work,
causing library typechecks to fail.

**How to apply:** Keep `createInsertSchema` for runtime validation where it is
needed, but derive TypeScript insert shapes from the corresponding Drizzle table.