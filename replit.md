# Bajeti

A household budget tracker for families, couples, or individuals. Any number of household members can sign in, track expenses, record contributions, set savings goals, and monitor spending — all together in one place.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/family-budget run dev` — run the web app (port 25043)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — session signing key

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Wouter routing, Recharts, TanStack Query
- API: Express 5
- Auth: Replit Auth (OpenID Connect + PKCE), sessions in PostgreSQL
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod, drizzle-zod
- API codegen: Orval (from OpenAPI spec)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/auth.ts` — users and sessions tables
- `lib/db/src/schema/budget.ts` — budget_categories, expenses, contributions tables
- `artifacts/api-server/src/routes/` — backend route handlers
- `artifacts/family-budget/src/pages/` — dashboard, expenses, budget, contributions, activity, login
- `artifacts/family-budget/src/components/layout.tsx` — shared sidebar/nav
- `lib/replit-auth-web/` — browser auth hook (`useAuth`)

## Architecture decisions

- Budget total is derived from the sum of budget_categories — never hardcoded
- Budget categories are seeded at startup, not user-managed (stable reference data)
- Sessions stored in PostgreSQL via Replit Auth; no local auth (no passwords)
- All API routes require authentication (401 if not signed in)

## Product

- **Dashboard** — monthly budget vs spent hero card, contribution status per parent, category spending chart, activity feed
- **Expenses** — add/view/delete expenses by category and month
- **Budget** — 14 categories with progress bars, grouped by priority tier
- **Contributions** — record monthly deposits, track target vs contributed per parent
- **Activity** — unified feed of all expenses and contributions

## User preferences

- **Public-friendly**: The app is for the masses — no hardcoded personal names, IDs, or targets anywhere in UI or API code. All member data must be dynamic (loaded from the members table / API). Contribution targets are optional per-member fields set in the DB, not constants in code.

## ⚠️ Parity checklist — update on every feature change

Whenever you add, change, or remove a feature on **either** platform, you **must** update both:

1. **`PARITY.md`** (repo root) — update the relevant row's status symbol (✅ / ⏳ / ❌) and gap note. Append a new row if the feature isn't listed yet.
2. **`artifacts/family-budget/src/pages/parity.tsx`** — update the matching entry in the `PARITY_ITEMS` constant (same status and note). The `/parity` web page is generated from this constant, so it must stay in sync with `PARITY.md`.

Both files must be updated in the **same commit** as the feature work. Never leave them out of date.

## Gotchas

- Run codegen after every OpenAPI spec change before touching backend or frontend code
- `zod/v4` import path doesn't bundle with esbuild; use `zod` directly in api-server routes
- Budget categories are seeded via SQL — rerun the seed INSERT if the table is ever wiped

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `replit-auth` skill for auth flow details
