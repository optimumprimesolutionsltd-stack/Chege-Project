---
name: Member participation permissions
description: The product boundary between ordinary group participation and management of shared finances.
---

Members can view shared information, log expenses in their own name, deposit their own funds into the shared bank, and contribute to existing goals. Owners and admins manage membership, budgets, goal lifecycle, recurring/shared-bank expenses, withdrawals, transfers, and other shared setup.

**Why:** Invited group members need useful day-to-day participation without being able to alter shared plans or remove and reallocate pooled funds.

**How to apply:** Enforce this boundary from authenticated group role and user identity on the server first. Client controls should match the permission rather than exposing a control that will fail after submission.

Owners and admins can invite a person as either a member or an admin, and can promote or demote non-owner group members—including other admins. The owner role is immutable and the owner cannot be removed.

**Why:** Groups need shared administration similar to WhatsApp groups, while retaining one protected account owner so a management dispute cannot leave the group without its original steward.

**How to apply:** Role-changing and removal routes must verify manager status and reject any target whose stored role is `owner`; do not rely on disabled controls alone.