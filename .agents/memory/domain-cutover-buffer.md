---
name: Domain cutover buffer
description: Production domain migration rule for Jamvi's Render hosting.
---

Keep the currently working production domain active as a buffer while introducing or verifying any replacement domain.

**Why:** A DNS change can take time to propagate and can interrupt users, sessions, OAuth callbacks, or invitation links if the new route is not ready.

**How to apply:** All candidate deployments should first land on a separate Render staging service and its generated Render URL. Only merge verified changes into `main`, which deploys the production service and its current public domain. Keep staging data and secrets separate from production.