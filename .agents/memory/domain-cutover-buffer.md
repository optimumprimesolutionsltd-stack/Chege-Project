---
name: Domain cutover buffer
description: Production domain migration rule for Jamvi's Render hosting.
---

Keep the currently working production domain active as a buffer while introducing or verifying any replacement domain.

**Why:** A DNS change can take time to propagate and can interrupt users, sessions, OAuth callbacks, or invitation links if the new route is not ready.

**How to apply:** Configure and verify the replacement domain on Render first. Do not remove or repoint the current domain until the new domain serves the complete Jamvi app successfully and the cutover is intentional.