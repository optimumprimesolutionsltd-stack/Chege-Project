---
name: Render single-service hosting
description: Production deployment shape and external-service constraints for Jamvi on Render.
---

Jamvi production is intentionally one persistent Render Web Service that builds
the Vite web app and serves it through the Express API process. Keep the SPA,
API, cookie session, OAuth callback, and emailed links on one canonical HTTPS
origin.

**Why:** Splitting the static web app and API would introduce cross-origin
cookies, CORS, OAuth callback, and invite-link complexity without a product
benefit. Replit object storage is not available on Render, so production photos
use an external S3-compatible private bucket instead.

**How to apply:** Preserve same-origin `/api` routing and SPA fallback ordering.
The Render start command uses `pnpm --filter`, so the API script runs with the
API package as its working directory rather than the repository root. Resolve
sibling build outputs from a stable package/module location, never from
`process.cwd()`.
Before a DNS cutover, run the documented legacy-photo migration in the Replit
source environment, then validate the Render staging origin with staging Google
OAuth settings. Do not use Replit Auth for external production hosting; use the
configured external Google OAuth path.