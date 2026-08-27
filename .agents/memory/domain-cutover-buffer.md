---
name: Domain cutover buffer
description: Production domain migration rule for Jamvi's Render hosting.
---

Use two Render Web Services for Jamvi: the existing generated `onrender.com`
service tracks `staging`, while a separate service tracks `main` and owns the
paid public domain. Render's automatically assigned hostname for the
production service does not need to be exposed or purchased as another domain.

**Why:** This lets every release be verified on the existing Render hostname
before it reaches the public domain, without requiring a third purchased
domain or risking that staging changes share production infrastructure.

**How to apply:** Develop on a feature branch, merge to `staging`, verify the
existing Render URL, then merge the verified commit to `main`. Keep staging
and production databases, OAuth applications, email settings, photo buckets,
and origin URLs separate. Attach the paid domain only to production.