---
name: Multiple bank accounts
description: Durable product rules for bank accounts within Jamvi workspaces.
---

Bank accounts belong to the active workspace. Personal and Shared budgets can each contain multiple accounts, while dashboards and reports aggregate every account exactly once.

Every account is identified by a user-defined name. “Main account,” “Personal account,” and “Joint account” are not account types or UI labels; use the chosen account name, with “Bank account” only as a neutral fallback.

Workspaces may have zero bank accounts. Listing bank data must never auto-create a placeholder or promote the first account to a hidden default; every account is created explicitly by an authorized user.

Deposit and withdrawal are matching first-class bank actions: both require the selected account, are recorded in its transaction history, and update that account’s balance.

**Why:** The user expects every displayed account to represent one they deliberately created. Account-specific screens must also not cause home totals to omit money held outside the selected account, and terminology changes must never rewrite legacy balances or transactions.

**How to apply:** Require explicit account creation and selection for new bank-linked records, surface easy naming/editing controls to authorized users, keep expense splits and linked ledger entries on one coherent account, scope every lookup to the active workspace, allow the final empty account to be removed, and never remove an account with transaction history.