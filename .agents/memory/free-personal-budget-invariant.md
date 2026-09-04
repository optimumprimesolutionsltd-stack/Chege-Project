---
name: Free Personal budget invariant
description: Product rule that every Jamvi login owns one free Personal budget before using Shared budgets
---

Every authenticated Jamvi identity must own exactly one free Personal budget. Shared budgets are optional additions and must never be the person’s only budget.

**Why:** The pricing model makes Personal budgeting the free foundation of every account. Allowing group-only accounts hides that value and creates inconsistent onboarding, ownership, and upgrade behavior.

**How to apply:** Provision the Personal budget idempotently at a trusted server boundary before workspace discovery or Shared-budget creation. Preserve legacy Shared-ledger adoption first, keep Personal and Shared records separate, and never restore removed Shared access while establishing the Personal budget.