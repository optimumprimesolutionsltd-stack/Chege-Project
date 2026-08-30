---
name: Mixed expense funding controls
description: Why bank-plus-direct expense controls must be driven by explicit mixed-funding state.
---

When an expense uses a bank account plus personal funding, keep both control sets visible from an explicit mixed-funding state. Do not infer “bank only” solely from payer IDs.

**Why:** Personal budgets can retain an internal owner payer identity even while the visible form is bank-funded. Treating any payer ID as visible personal funding can suppress the action that lets a user add the direct portion.

**How to apply:** In expense create/edit forms, bank selection controls bank fields, mixed mode controls whether direct payer and income-source fields are also shown, and changing either allocation must not clear the other.