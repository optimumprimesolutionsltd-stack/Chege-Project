---
name: Group workspace migration
description: Rollout rule for moving the legacy shared ledger into its first private group.
---

Legacy financial records are assigned to the initial shared group lazily, inside the authenticated membership-resolution transaction. The initial legacy members become an owner and administrators so the established two-person access pattern remains intact.

**Why:** The application must remain available while it transitions, and startup-time migrations are unsafe for managed schema deployment and cannot establish ownership from an authenticated person.

**How to apply:** Keep all trusted group selection server-side. Any future group switcher or invitation flow must resolve the active group from a verified membership, and must not accept a client-supplied group identifier as an authorization boundary.