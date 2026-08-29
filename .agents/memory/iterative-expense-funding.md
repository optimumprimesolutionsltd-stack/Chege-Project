---
name: Iterative expense funding
description: Product rule for funding one expense from several income or bank portions.
---

Expense funding must support as many sequential portions as needed to reach the expense total. After every portion, show the live remaining or overfunded amount; when another source is chosen, prefill it with the current remainder while keeping it editable.

**Why:** A fixed two-source split does not reflect how users may combine several small funding sources to pay one expense.

**How to apply:** Any expense-entry surface should keep offering eligible sources while a positive remainder exists, stop presenting the expense as incomplete only when the total reaches zero, and preserve exact-total validation at save time.