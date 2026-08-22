---
name: Manual bank opening balance
description: Product rule for how a workspace's bank balance starts and who may change it.
---

Use a manually entered opening balance for each workspace's bank account. Treat it as the amount already present before recorded bank activity, not as a deposit or another ledger transaction. The current balance is the opening balance plus deposits minus withdrawals.

**Why:** The product owner selected the manual method so a group can begin using Bajeti without recreating historical bank activity.

**How to apply:** Keep the value workspace-scoped. Only owners and admins may change it, show its effect plainly in the bank UI, and preserve it independently from transaction edits, deletions, and imports.