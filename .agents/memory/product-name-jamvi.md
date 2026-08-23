---
name: Product name is Jamvi
description: The product is Jamvi. Any other product name appearing in the code is a regression, not a rename in progress.
---

The product is **Jamvi**. It is named after the large woven mat a group sits on together. Every user-facing string, page title, email, PDF heading, storage key and download filename uses Jamvi.

An earlier name still appears occasionally in files that get rewritten from an out-of-date copy of the repository. When that happens it is always a regression, never a deliberate change, and it should be corrected rather than preserved for consistency with surrounding code.

**Why:** the rename is complete and the domain is registered. Reintroducing the previous name puts the wrong brand in front of users - in invitation emails, on the dashboard, and in the filename of every downloaded report - and it has already happened three times in files edited from stale copies.

**How to apply:** before editing, make sure the workspace is up to date with `origin/main` - that drift is what causes this. After any change, run the same search CI runs; the exact pattern is in `.github/workflows/ci.yml`, in the step named "Old product name must not reappear". CI fails the build on any match, so it will be caught either way, but catching it locally is faster. Mobile identifiers are `ke.co.optimumprimesolutions.jamvi` and are permanent once published.
