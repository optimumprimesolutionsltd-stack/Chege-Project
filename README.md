# Jamvi

A personal and group money-management platform for individuals, families,
chamas, clubs and teams. Private personal budgets and shared group workspaces
live side by side, each with its own financial data.

Budgets, expenses, contributions, income sources, savings goals, a joint bank
fund with transactions, reports, activity history, members, roles and
invitations.

## Repository layout

A pnpm workspace. Applications live in `artifacts/`, shared code in `lib/`.

| Package | What it is |
| --- | --- |
| `artifacts/api-server` | Express API |
| `artifacts/family-budget` | Web app (React + Vite) |
| `artifacts/mobile-budget` | Mobile app (React Native + Expo) |
| `artifacts/mockup-sandbox` | Design scratch space |
| `lib/api-spec` | OpenAPI contract — the source of truth for the API |
| `lib/api-client-react` | Generated React Query hooks |
| `lib/api-zod` | Generated Zod schemas |
| `lib/db` | Drizzle schema and database client |
| `lib/replit-auth-web` | Browser `useAuth` hook (no Replit-specific code despite the name) |

The workspace package names still read `family-budget` and `mobile-budget`.
They are internal identifiers, referenced by the Replit workflows and the
deployment config, and are deliberately not renamed.

## Running it

```
pnpm --filter @workspace/api-server run dev      # API, port 8080
pnpm --filter @workspace/family-budget run dev   # web, port 25043
pnpm --filter @workspace/mobile-budget run dev   # Expo
```

```
pnpm run typecheck                               # every package
pnpm run build                                   # typecheck, then build
```

Copy `.env.example` to `.env` and fill it in. `DATABASE_URL` is required for
anything to start.

## Stack

pnpm workspaces, Node 24, TypeScript 5.9. React 19 + Vite 7, Wouter, TanStack
Query, Recharts, Tailwind 4. Express 5. PostgreSQL with Drizzle ORM. Zod for
validation, Orval for API codegen. React Native + Expo, released through EAS.

## How the API contract works

`lib/api-spec/openapi.yaml` is the source of truth. Change it, then regenerate
before touching server or client code:

```
pnpm --filter @workspace/api-spec run codegen
```

Both `lib/api-client-react` and `lib/api-zod` are generated. Do not edit files
under `src/generated/` by hand.

## Database

Schema lives in `lib/db/src/schema/` across three files: `auth`, `budget` and
`groups`.

```
pnpm --filter @workspace/db run generate   # write a migration from the schema
pnpm --filter @workspace/db run migrate    # apply pending migrations
pnpm --filter @workspace/db run push       # development only
```

`push` applies the schema directly with no migration record. It is fine
against a scratch database and never appropriate against one holding real
data.

## Workflow

Replit is the development environment — building, testing, previewing,
debugging. GitHub is the source of truth. Production deploys from GitHub,
independently of Replit.

```
Replit  ⇄  GitHub  →  production
```

Push before you stop for the day. Work that exists only inside the Repl is
work that exists in one place.

## Deployment notes

The API needs a long-lived process: the monthly digest is scheduled with
`node-cron`, which does not survive on serverless functions. The web app is
static once built.

Publishing the web app does **not** update mobile apps already installed on
phones. Those are released separately through Expo/EAS, so the API has to stay
compatible with whatever build is on people's devices.

## Gotchas

- Run codegen after every OpenAPI change, before writing code against it.
- Import `zod` directly in api-server routes; the `zod/v4` path does not bundle
  with esbuild.
- Budget categories are seeded at startup and are not user-managed.
- `pnpm-workspace.yaml` strips non-Linux esbuild and rollup binaries, so
  `build`, `test` and `drizzle-kit` only run on Linux. Typechecking works
  anywhere.

## Licence

Jamvi is a product of Optimum Prime Solutions Ltd, Nairobi.
