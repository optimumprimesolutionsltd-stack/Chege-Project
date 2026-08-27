# Deploying off Replit

> Current hosting uses the two-service Render setup documented in
> [`RENDER_DEPLOYMENT.md`](./RENDER_DEPLOYMENT.md). The Vercel/API split below
> is retained as legacy reference only.

The app is split across two hosts: the Vite SPA on Vercel, and the Express API
on any host that runs a long-lived Node process (Railway, Render, Fly.io).
The API is not serverless-ready — it calls `app.listen` and schedules the
monthly digest with `node-cron`, neither of which survives on Vercel functions.

## Environment variables

### API server

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string. Use the **pooled** one. Must keep `?sslmode=require`. |
| `SESSION_SECRET` | Session signing key. |
| `GOOGLE_CLIENT_ID` | OAuth client id from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret. |
| `APP_ORIGIN` | The origin users load in the browser — the Vercel URL, e.g. `https://family-budget.vercel.app`. See below. |
| `RESEND_API_KEY` | Resend key for the monthly digest. Previously held by the Replit connector. |
| `DIGEST_FROM_EMAIL` | Optional. Defaults to `Jamvi <onboarding@resend.dev>`. |
| `PORT` | Set by the host. |

`ISSUER_URL` defaults to `https://accounts.google.com` and only needs setting
to swap identity provider.

### Frontend (Vercel)

None required. `BASE_PATH` defaults to `/` and `PORT` is only used by the dev
server.

## Why APP_ORIGIN matters

Vercel proxies `/api/*` to the API host, so the API sees its own hostname in
the request headers, not the address the user is on. Google redirects the
browser **straight to the callback URL** without passing back through that
proxy. If the callback resolved to the API host, the session cookie would be
set on the wrong domain and login would fail silently. `APP_ORIGIN` pins the
callback and the cookie to the origin the user actually loaded.

## Google OAuth setup

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID
2. Application type: **Web application**
3. Authorised redirect URI: `https://<your-vercel-domain>/api/callback`
   — add `http://localhost:5173/api/callback` too if you develop locally
4. OAuth consent screen: **External**, publishing status can stay in Testing.
   Add both parents' Gmail addresses as test users.
5. Copy the client id and secret into the API host's environment.

## Identity is matched on email, not Google's `sub`

Expenses, contributions, members and savings goals store bare user id strings
with **no foreign key constraints**. The existing rows are keyed to the old
Replit ids. On login the user is looked up by email and keeps that original id,
so the history stays attached. If a parent signs in with a Gmail address that
differs from the one on their `users` row, they will get a brand new empty
account rather than an error — check the `users` table before first login.

## Vercel configuration

`vercel.json` at the repo root carries the install command, build command and
output directory. Before the first deploy, replace
`REPLACE-WITH-YOUR-API-HOST` in the `/api/:path*` rewrite with the API's public
hostname.

## Note on local builds

`pnpm-workspace.yaml` strips every non-Linux esbuild and rollup binary, so
`build` and `test` only run on Linux. Typechecking works anywhere.
