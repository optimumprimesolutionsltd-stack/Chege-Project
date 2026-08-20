---
name: Generated boolean query parsing
description: Safely parse boolean values in API query strings when using generated Zod query schemas.
---

Do not rely on a generated `zod.coerce.boolean()` query schema to distinguish the URL values `"true"` and `"false"`: both are non-empty strings, so the latter can be coerced as truthy.

**Why:** A category ledger request for the synthetic unbudgeted row arrived as `isBudgeted=false` but was handled as budgeted, returning no transactions.

**How to apply:** At server HTTP boundaries where a boolean query changes data selection, accept only the literal strings `"true"` and `"false"`, return `400` for any other value, and derive the boolean from that explicit comparison. Generated client helpers safely serialize boolean values as those strings.