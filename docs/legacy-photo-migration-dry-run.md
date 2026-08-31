# Jamvi Legacy Photo Migration: Dry-Run Instructions

This runbook checks whether older Jamvi profile and workspace photos can still be found in the original Replit private object storage. It is **read-only**: it does not upload files, update database rows, or delete objects.

## What the dry run does

The script:

1. Reads user and workspace photo references from the database.
2. Keeps only recognized legacy object paths.
3. Requests temporary read URLs from the Replit object-storage sidecar.
4. Downloads each referenced photo into memory.
5. Checks its content type and size.
6. Calculates a SHA-256 checksum.
7. Prints a verification result.

The dry run does **not** use `PHOTO_MIGRATION_WRITE=true`, so it stops before any S3 upload.

## Prerequisites

Run this from a checked-out copy of:

```text
optimumprimesolutionsltd-stack/Chege-Project
```

Use the original Replit environment if possible. The original environment is important because the legacy source photos are accessed through the Replit object-storage sidecar at `127.0.0.1:1106`.

You need:

- Node.js and pnpm available
- The repository dependencies installed
- A database connection through `DATABASE_URL`
- The original Replit `PRIVATE_OBJECT_DIR`
- Access to the Replit object-storage sidecar

Do not paste database passwords, S3 secrets, OAuth secrets, or private object paths into chat, GitHub, or a public document.

## Option A: Run in Replit

1. Open the original Replit project that contains the legacy Jamvi storage.
2. Open the **Shell** tab.
3. Change to the repository directory:

   ```bash
   cd /path/to/Chege-Project
   ```

4. Confirm the repository and package files are present:

   ```bash
   test -f package.json
   test -f artifacts/api-server/package.json
   test -f artifacts/api-server/src/migrateLegacyPhotos.ts
   echo "repository files found"
   ```

5. Confirm the two required environment variables are present without printing their values:

   ```bash
   test -n "$DATABASE_URL" && echo "DATABASE_URL is set" || echo "DATABASE_URL is missing"
   test -n "$PRIVATE_OBJECT_DIR" && echo "PRIVATE_OBJECT_DIR is set" || echo "PRIVATE_OBJECT_DIR is missing"
   ```

6. Install dependencies if this checkout has not been installed:

   ```bash
   corepack pnpm install --frozen-lockfile --prod=false --config.strictDepBuilds=false
   ```

7. Build the API server and its workspace dependencies:

   ```bash
   corepack pnpm run build:libs
   corepack pnpm --filter @workspace/api-server run build
   ```

   If the repository does not expose `build:libs`, use the project’s normal build command first, then build the API package:

   ```bash
   corepack pnpm --filter @workspace/api-server run build
   ```

8. Run the dry run:

   ```bash
   corepack pnpm --filter @workspace/api-server run migrate:legacy-photos
   ```

   The command is dry-run by default. Do not add `PHOTO_MIGRATION_WRITE=true`.

## Option B: Run locally

A local machine can run the script only if it can reach the original Replit object-storage sidecar. A normal local checkout usually cannot reach `http://127.0.0.1:1106` for the Replit environment, so the command may find database references but fail while downloading the source photos.

If you have a secure tunnel or an equivalent local Replit-compatible sidecar, use:

```bash
cd /path/to/Chege-Project
corepack pnpm install --frozen-lockfile --prod=false --config.strictDepBuilds=false
corepack pnpm run build:libs
corepack pnpm --filter @workspace/api-server run build
corepack pnpm --filter @workspace/api-server run migrate:legacy-photos
```

Set `DATABASE_URL` and `PRIVATE_OBJECT_DIR` in the local environment using your secret manager or shell session. Do not commit a `.env` file.

## Expected dry-run output

A successful run logs an initial summary similar to:

```text
Checking legacy private photos for Render migration
count: <number>
write: false
```

For each recoverable photo, it logs a dry-run verification containing:

- A photo object path
- Whether it belongs to a profile or workspace
- File size
- SHA-256 checksum

It ends with:

```text
Legacy private photo dry run completed
```

The exact count and paths are environment-specific. Do not share private photo paths publicly.

## Interpreting failures

### `DATABASE_URL` is missing

Run the command in the original authenticated Replit project or configure the database connection through the environment’s secret manager. Do not put the connection string directly in a command that may be saved in shell history.

### `PRIVATE_OBJECT_DIR must be set`

The script does not know which Replit private bucket contains the legacy objects. Configure the original Replit `PRIVATE_OBJECT_DIR` secret, then rerun the dry run.

### `Could not sign legacy photo download`

The process cannot reach or authenticate with the Replit object-storage sidecar. Run the command from the original Replit environment instead of Render or an ordinary local machine.

### `Could not download legacy photo`

The database reference exists, but the source object is missing or inaccessible. Record the error privately; do not enable write mode.

### `unsupported content type` or size error

The referenced object is not an accepted JPG, PNG, or WebP file, or it is outside the allowed 1 B–15 MB range. It will not be migrated by this script.

### `count: 0`

This can mean either that no database rows reference legacy photos or that the current database contains only new S3-compatible paths. Confirm the service’s current photo references privately before concluding that no photos are recoverable.

## Safety checklist

Before running:

- Confirm this is the original Replit environment or a secure equivalent.
- Confirm `PHOTO_MIGRATION_WRITE` is absent or not equal to `true`.
- Confirm the command contains no write flag.
- Confirm you are not using `drizzle-kit push` or any schema command.
- Confirm you are not deleting or rewriting photo-path columns.

After running:

- Save the output privately.
- Record the number of references found.
- Record which objects failed, if any.
- Keep the checksums for later verification.
- Do not run the write migration yet.

A quick write-mode safety check is:

```bash
if [ "$PHOTO_MIGRATION_WRITE" = "true" ]; then
  echo "STOP: write mode is enabled"
  exit 1
else
  echo "Dry-run mode confirmed"
fi
```

## What to send back for review

Share only a summary, not secrets or private object paths:

```text
Dry run completed: yes/no
Environment: Replit/local
Photo references found: <number>
Photos verified: <number>
Photos missing or failed: <number>
S3 write performed: no
```

Once the dry-run results confirm that the old source files are accessible, the next step is to plan a controlled migration to S3 with explicit write mode and per-file verification. That is a separate operation and must not be combined with this dry run.
