---
name: Private photo personalization
description: Privacy and persistence rules for person and Shared budget photos.
---

Personal profile photos and Shared budget photos are uploaded as private objects. Persist an object path, not a temporary signed URL; the server resolves an authorized short-lived URL when returning the active user or workspace data.

**Why:** A group image is owned by the shared workspace and must not be exposed through an unconditional public asset path. Signed viewing URLs also work in native image controls without sending session credentials in the image request.

**How to apply:** Keep upload authorization on the server, validate photo type and size before minting upload URLs, and refresh identity/workspace queries after an upload or removal. Do not convert this flow to public object storage merely to simplify image rendering.