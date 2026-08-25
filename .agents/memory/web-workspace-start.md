---
name: Web workspace start
description: How Jamvi chooses the active workspace when a web or mobile session starts.
---

Every Jamvi sign-in and mobile app launch must start in the authenticated person's Personal budget, even if they previously used a Shared budget.

**Why:** Personal money is the safe, predictable home view when a person returns. A Shared budget should remain an explicit choice for the current session instead of becoming the default after sign-out or an app relaunch.

**How to apply:** Clear any active workspace preference at web sign-in and sign-out, and clear the mobile workspace preference as authentication is restored or ended. Keep verified workspace selection available for the current session, with server-side membership checks intact.