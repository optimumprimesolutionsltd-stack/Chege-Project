---
name: Destructive prompt budget context
description: Requires destructive confirmations and related access messages to identify the affected budget.
---

Every confirmation or authorization message for deleting, removing, or leaving something must explicitly name the affected budget. Use the shared budget’s displayed name; use **Personal budget** for private workspaces.

**Why:** Jamvi can keep several Personal and Shared budgets available, so a generic destructive prompt can make users unsure which workspace will change.

**How to apply:** Include the budget name in destructive prompts for expenses, activity records, bank accounts and transactions, income sources, categories, goals and contributions, member access, and leaving a shared budget. Preserve the name when adding new destructive actions on web or mobile.