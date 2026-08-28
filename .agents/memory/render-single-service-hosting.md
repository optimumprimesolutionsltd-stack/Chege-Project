---
name: Render single-service hosting
description: Production deployment shape and external-service constraints for Jamvi on Render.
---

Jamvi production is intentionally one persistent Render Web Service that builds
both Jamvi Vite web builds and serves them through the Express API process.
The public marketing site owns `/`, the authenticated user app owns `/app/`,
and the API owns `/api`. Keep both SPAs, cookie sessions, OAuth callbacks, and
emailed links on the `jamvi.co.ke` HTTPS origin.

**Why:** Splitting the static web app and API would introduce cross-origin
cookies, CORS, OAuth callback, and invite-link complexity without a product
benefit. Replit object storage is not available on Render, so production photos
use an external S3-compatible private bucket instead.

**How to apply:** Preserve same-origin `/api` routing and SPA fallback ordering.
The shared Optimum operations panel remains at
`optimumprimesolutions.co.ke/admin`; it may link to a future Jamvi Operations
tool, but it must not receive direct access to Jamvi financial records. Jamvi
group roles are product roles and are separate from platform operations access.
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

A successful migration command only proves that migrations ran against the
database named by Render's current `DATABASE_URL`; it does not prove that URL is
the intended restored Jamvi database.

**Why:** A web service can stay healthy and report successful migrations while
pointing at a separate or stale PostgreSQL database, then fail when authenticated
routes first use current workspace tables.

**How to apply:** Verify Render's `DATABASE_URL` against the connection URL for
the database that actually received the Jamvi restore, then rerun migrations
after correcting the variable.

Production acceptance should cover the complete first-user journey: Google
sign-in, first Personal budget load, and creating/joining a Shared budget through
an invitation.

**Why:** Server health and authentication alone do not prove that workspace
creation, membership, and the product's core shared-money path work on the
external deployment.

**How to apply:** Use those three flows as the minimum smoke test after a
database or Render configuration change, before inviting real members.