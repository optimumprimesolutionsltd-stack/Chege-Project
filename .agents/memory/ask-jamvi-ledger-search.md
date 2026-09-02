---
name: Ask Jamvi ledger search
description: Product boundary between conversational ledger lookup and full workspace search.
---

Ask Jamvi may explain and find matching individual expense or bank entries from the selected month, but remains read-only. Broader record lookup belongs in the Search surface, grouped into All, Expenses, Bank, Goals, and Income.

**Why:** Totals-only context made conversational searches for named ledger entries impossible, while sending unlimited financial history to an AI provider would be unnecessary and privacy-unfriendly.

**How to apply:** Keep every search workspace-scoped. Give Ask Jamvi bounded current-period ledger context, and use deterministic database search for older or cross-type records. Neither surface may create, edit, delete, or move money.