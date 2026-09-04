---
name: M-Pesa parser staging
description: Product boundary, privacy rule, and incremental workflow for the standalone M-Pesa parser laboratory.
---

Build the M-Pesa parser as a standalone, deterministic laboratory. Add transaction-family rules only after the user supplies 3–5 anonymized examples of that one family; never infer or invent unsupported message formats or missing fields.

**Why:** The laboratory exists to prove reliable extraction before any budgeting integration. Real M-Pesa wording varies, and guessed formats would create false confidence around financial data.

**How to apply:** Keep raw-message parsing behind the reusable API, avoid logging or cloud-persisting message text, store laboratory cases in the browser, return null plus explicit warnings for missing fields, and request only one transaction family at each stage.