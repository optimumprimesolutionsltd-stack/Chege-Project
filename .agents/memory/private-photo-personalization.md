---
name: Private photo personalization
description: Privacy and persistence rules for person and Shared budget photos.
---

Personal profile photos and Shared budget photos are uploaded as private objects. Persist an object path, not a temporary signed URL; the server resolves an authorized short-lived URL when returning the active user or workspace data.

**Why:** A group image is owned by the shared workspace and must not be exposed through an unconditional public asset path. Signed viewing URLs also work in native image controls without sending session credentials in the image request.

**How to apply:** Keep upload authorization on the server, validate photo type and size before minting upload URLs, and refresh identity/workspace queries after an upload or removal. Do not convert this flow to public object storage merely to simplify image rendering.

The Personal budget automatically reuses its owner’s profile photo wherever a budget identity is shown. Do not upload or persist a duplicate Personal budget photo. Shared budgets retain their own independent group photo.

**Why:** The Personal budget and profile represent the same person, so asking for two photos is confusing and can let the two identities drift apart. A Shared budget represents a group and still needs a distinct image.

**How to apply:** On web and mobile, resolve a Personal budget’s displayed image from the signed-in user’s profile photo and fall back to its normal icon when none exists. Continue resolving Shared budget images from the workspace photo.

Photo uploads are capped at 15 MB, while clients should compress high-resolution square images before direct upload.

**Why:** Modern phone photos commonly exceed the former 5 MB limit; client-side optimization keeps normal uploads quick while the storage-side policy retains a firm abuse and cost boundary.

**How to apply:** Keep the API input schema, storage POST policy, client validation, migration checks, help text, and regression tests aligned to the 15 MB limit. Do not raise only a client-side or server-side limit.