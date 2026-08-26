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

The external Render database must have the checked-in Drizzle migrations applied
before OAuth testing. A successful `select 1` health check proves connectivity,
not schema compatibility; missing user columns can still make the first
post-Google account lookup fail.

**Why:** The single-service health check can report healthy while a restored or
new external database is behind the application schema, leaving sign-in as the
first request that exposes the mismatch.

**How to apply:** Point Render's `DATABASE_URL` at the intended external
database, run `corepack pnpm@11.20.0 --filter @workspace/db run migrate` once,
and never use `push-force` against production.