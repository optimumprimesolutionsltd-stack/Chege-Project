---
name: Ask Jamvi ledger search
description: Product boundary between conversational ledger lookup and full workspace search.
---

Ask Jamvi may answer across the whole selected budget—current-period totals, categories and priorities, goals, live bank balances, income sources, contributions, activity, reports, workspace details, and a bounded slice of historical expense and bank entries—but remains read-only. Exhaustive record lookup belongs in the Search surface, grouped into All, Expenses, Bank, Goals, and Income.

**Why:** Totals-only context made conversational searches for named ledger entries impossible, while sending unlimited financial history to an AI provider would be unnecessary and privacy-unfriendly.

**How to apply:** Keep every search workspace-scoped. Give Ask Jamvi bounded current-period and historical ledger context plus read-only summaries of the other app areas, and use deterministic database search when the user needs exhaustive records beyond that bound. Neither surface may create, edit, delete, or move money.