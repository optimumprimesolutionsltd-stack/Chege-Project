---
name: Member participation permissions
description: The product boundary between ordinary group participation and management of shared finances.
---

Members can view shared information, log expenses in their own name, deposit their own funds into the shared bank, and contribute to existing goals. Owners and admins manage membership, budgets, goal lifecycle, recurring/shared-bank expenses, withdrawals, transfers, and other shared setup.

**Why:** Invited group members need useful day-to-day participation without being able to alter shared plans or remove and reallocate pooled funds.

**How to apply:** Enforce this boundary from authenticated group role and user identity on the server first. Client controls should match the permission rather than exposing a control that will fail after submission.