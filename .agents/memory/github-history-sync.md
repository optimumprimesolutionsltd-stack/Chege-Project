---
name: GitHub history sync
description: How to publish local Git history when shell push is not authenticated.
---

When the workspace's `git push` reports missing or invalid GitHub credentials, attach the authorized GitHub integration and use its authenticated Git data API proxy. The OAuth connection does not automatically configure credentials for the shell Git client.

**Why:** A shell push can fail even though the Replit GitHub connection has repository write permission.

**How to apply:** Read the live remote ref first; the local tracking ref may be stale. Recreate local blobs, trees, and commits through the Git data API in parent order. If the remote advanced, merge both histories and never force-update it. Verify trees exactly. GitHub may normalize commit metadata and produce different commit SHAs; API-native commits are acceptable when their trees match and the final commit is a fast-forward merge containing the live remote head.