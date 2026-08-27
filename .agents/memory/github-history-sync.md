---
name: GitHub history sync
description: How to publish local Git history when shell push is not authenticated.
---

When the workspace's `git push` reports missing or invalid GitHub credentials, attach the authorized GitHub integration and use its authenticated Git data API proxy. The OAuth connection does not automatically configure credentials for the shell Git client.

**Why:** A shell push can fail even though the Replit GitHub connection has repository write permission.

**How to apply:** Preserve the commit chain by recreating local blobs, trees, and commits through the Git data API in parent order. Pass the commit message exactly as stored, including its trailing newline, or GitHub creates a different SHA. Verify every recreated SHA matches locally, then advance the remote branch without force and refresh the local remote-tracking ref.