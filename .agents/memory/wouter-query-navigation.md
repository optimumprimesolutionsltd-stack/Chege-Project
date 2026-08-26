---
name: Wouter query-only navigation
description: How to open an existing dashboard action from a persistent control without relying on a same-route query-string update.
---

When a persistent control opens an action on the page already being viewed, use a browser event rather than navigating to the same Wouter route with a different query string. For a control on another page, route to the destination with a query parameter and parse `window.location.search` when the destination mounts.

**Why:** In this app's Wouter setup, changing only the query string on the current route does not notify or remount the existing route component. The URL changes but the intended UI state never opens.

**How to apply:** Keep query parameters as cross-route handoffs, remove them after consuming them, and dispatch a named `CustomEvent` for an in-place action on the active route.