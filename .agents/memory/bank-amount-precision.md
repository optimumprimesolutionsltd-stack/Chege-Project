---
name: Bank amount precision
description: Precision boundary between bank money and savings-goal money.
---

Bank opening balances, deposits, withdrawals, charges, internal bank transfers, and depositor portions support KES values with up to two decimal places. Savings-goal transfers remain whole KES.

**Why:** Bank statements can contain cents, while savings goals and their contribution records still use whole-shilling integer storage. Silently rounding would corrupt reconciliation.

**How to apply:** Validate bank values to two decimal places and compare split totals in integer cents. Reject, rather than round, decimal savings-goal transfers until goal storage is migrated end to end.