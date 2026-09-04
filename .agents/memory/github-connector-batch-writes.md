---
name: GitHub connector batch writes
description: Reliable strategy for publishing a workspace tree through the GitHub connector when a large transaction fails.
---

Upload file blobs through the GitHub connector in small batches, retain their returned SHAs, and perform the tree creation, commit creation, and non-forced branch update in a final short call.

**Why:** A single connector call combining many filesystem reads, blob uploads, and Git Data API writes can fail during durable-runtime replay or disconnect before branch update, while smaller blob batches succeed reliably.

**How to apply:** Verify the expected remote head before writing, create blobs in batches of a few files, then re-check the head and create the tree/commit/ref update with `force: false`. Fetch afterward and compare the remote tree hash with the local staged tree.