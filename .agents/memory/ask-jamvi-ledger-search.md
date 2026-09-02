---
name: Ask Jamvi ledger search
description: Product boundary between conversational ledger lookup and full workspace search.
---

Ask Jamvi may answer across the whole selected budget—totals, categories, goals, live bank balances, income sources, contributions, activity, reports, workspace details, and matching expense or bank entries from the selected month—but remains read-only. Broader record lookup belongs in the Search surface, grouped into All, Expenses, Bank, Goals, and Income.

**Why:** Totals-only context made conversational searches for named ledger entries impossible, while sending unlimited financial history to an AI provider would be unnecessary and privacy-unfriendly.

**How to apply:** Keep every search workspace-scoped. Give Ask Jamvi bounded current-period ledger context plus read-only summaries of the other app areas, and use deterministic database search for older or cross-type records. Neither surface may create, edit, delete, or move money.