---
name: Multiple bank accounts
description: Durable product rules for bank accounts within Jamvi workspaces.
---

Bank accounts belong to the active workspace. Personal and Shared budgets can each contain multiple accounts, while dashboards and reports aggregate every account exactly once.

Deposit and withdrawal are matching first-class bank actions: both require the selected account, are recorded in its transaction history, and update that account’s balance.

**Why:** Account-specific bank screens must not cause home totals to omit money held outside the selected account, and legacy workspaces need a safe default without losing prior balances or transactions.

**How to apply:** Require explicit account selection for new bank-linked records, keep expense splits and linked ledger entries on one coherent account, scope every lookup to the active workspace, and never allow removal of the final account or an account with transaction history.