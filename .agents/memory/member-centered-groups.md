---
name: Member-centered groups
description: The product model for account ownership, invitations, and flexible shared groups.
---

## Rule
Bajeti starts with one account owner per login identity. The owner may optionally invite or expose another household member profile, and the signed-in user may record entries on that member’s behalf. The group can represent spouses, a household, a chama, a club, or another team; “wife” and “husband” are examples, not special roles.

Personal records belong to and are visible only to their member. Shared records belong to the group and are visible to its members. Group membership and permissions should be modeled independently from relationship labels.

**Why:** The same budgeting workflows need to work for couples and non-family groups without changing the data model or user experience around fixed relationship types.

**How to apply:** Use neutral member/group terminology in APIs and screens. Keep one real profile per login identity, treat the signed-in user as the initial owner, preserve existing members during migrations, and make optional invitations/visible member profiles the path for adding collaborators. Never create a second login identity just to record entries for a spouse.