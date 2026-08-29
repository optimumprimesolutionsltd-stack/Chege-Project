---
name: Web workspace start
description: How Jamvi chooses the active workspace when a web or mobile session starts.
---

Web sign-out returns to Jamvi's public homepage instead of reopening the last authenticated screen. Entering the app afterward is an explicit sign-in/open-app action.

**Why:** The public homepage is the intended re-entry point after leaving the app. This prevents a stale authenticated route or workspace from looking like the app silently restored an old session.

**How to apply:** Keep the web logout return target at `/`. Keep OAuth's close page under the app base path (`/app/auth-done` when mounted at `/app`) so popup sign-in completes before the app opens.