---
name: Member-centered groups
description: The product model for account ownership, invitations, and flexible shared groups.
---

## Rule
Bajeti starts with one account owner. The owner may invite or remove members, and the group can represent a household, spouses, a chama, a club, or another team. “Wife” and “husband” are examples, not special roles.

Personal records belong to and are visible only to their member. Shared records belong to the group and are visible to its members. Group membership and permissions should be modeled independently from relationship labels.

**Why:** The same budgeting workflows need to work for couples and non-family groups without changing the data model or user experience around fixed relationship types.

**How to apply:** Use neutral member/group terminology in APIs and screens. Treat the signed-in user as the initial owner, preserve existing members during migrations, and make invitations the path for adding collaborators.