---
name: Web workspace start
description: How Jamvi chooses the active workspace when a web browser session starts.
---

New Jamvi web browser sessions must start in the authenticated person's private My Budget workspace, even if they previously used a shared workspace.

**Why:** Personal money is the safe, predictable home view when a person returns to the web app. A shared workspace should remain an explicit, in-session choice instead of becoming a multi-day default.

**How to apply:** Keep the web active-workspace preference session-scoped and version its cookie when changing persistence rules so prior long-lived selections cannot override the personal default. Preserve the server-side membership checks and the native app's verified workspace-header behavior.