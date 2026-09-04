---
name: Iterative expense funding
description: Product rule for funding one expense from several income or bank portions.
---

Expense funding must support as many sequential portions as needed to reach the expense total. After every portion, show the live remaining or overfunded amount. Direct income-source and member portions must start blank and be entered manually; a newly selected bank portion may use the current remainder.

**Why:** A fixed two-source split does not reflect how users may combine several small funding sources, but automatically assigning a direct portion can record the wrong source amount before the user notices.

**How to apply:** Any expense-entry surface should keep offering eligible sources while a positive remainder exists, leave each new direct portion blank, preserve bank remainder autofill, and require exact-total validation at save time. Once entered portions meet or exceed the expense total, keep selected sources editable but grey out and disable every unselected source; lowering a portion below the total must re-enable them immediately.