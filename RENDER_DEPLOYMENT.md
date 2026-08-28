# Deploy Jamvi on Render

Jamvi runs on Render as one Web Service per environment: Express serves the API
at `/api`, the public Jamvi marketing site at `/`, and the authenticated family
budget app at `/app/` on the same public HTTPS origin. This keeps browser
sessions, OAuth callbacks, invite links, and API calls on one domain while
allowing staging to be verified before production changes are released.

## 1. Connect the repository

1. Push this Replit workspace to the connected GitHub repository.
2. In Render, create a new **Blueprint** from that repository. Render reads
   `render.yaml` and creates or updates the `jamvi` staging service and the
   `jamvi-production` service.
3. Create and push a `staging` branch if it does not already exist:

   ```bash
   git checkout -b staging
   git push -u origin staging
   ```

4. Confirm the existing `jamvi` Render hostname is attached to the staging
   service. Deploy it before attaching the final custom domain to production.
5. Attach the paid custom domain only to `jamvi-production`.

Both services build from the repository root with pnpm 11.20.0. Their health
check is `GET /api/healthz`. Render may assign an additional generated
hostname to `jamvi-production`; no extra purchased domain is required.

## 2. Configure Render environment variables

Add the following values in each Render service's Environment page. Store
secrets only in Render; do not commit them or paste them into chat. Staging and
production must use separate databases, OAuth credentials, email settings, S3
buckets, and `APP_ORIGIN`/`APP_URL` values.

| Variable                 | Purpose                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `DATABASE_URL`           | The external PostgreSQL connection string for this environment.           |
| `APP_ORIGIN`             | The exact HTTPS origin for this environment.                             |
| `APP_URL`                | The same origin; used in invitation and digest links.                    |
| `AUTH_PROVIDER`          | Set to `google` for an externally hosted deployment.                     |
| `GOOGLE_CLIENT_ID`       | Google OAuth client ID.                                                  |
| `GOOGLE_CLIENT_SECRET`   | Google OAuth client secret.                                              |
| `RESEND_API_KEY`         | Resend key used for invitations and monthly digests.                     |
| `INVITATION_FROM_EMAIL`  | A verified Resend sender for invitations.                                |
| `DIGEST_FROM_EMAIL`      | A verified Resend sender for monthly digests.                            |
| `PHOTO_STORAGE_PROVIDER` | Set to `s3`.                                                             |
| `S3_BUCKET`              | Private S3-compatible bucket name.                                       |
| `S3_REGION`              | Bucket region. Use `auto` for Cloudflare R2.                             |
| `S3_ENDPOINT`            | Optional provider endpoint; required by providers such as Cloudflare R2. |
| `S3_FORCE_PATH_STYLE`    | Set to `true` when the S3-compatible provider requires path-style URLs.  |
| `AWS_ACCESS_KEY_ID`      | Access key with access only to the private photo bucket.                 |
| `AWS_SECRET_ACCESS_KEY`  | Matching secret key.                                                     |

`NODE_ENV=production` and `SERVE_WEB=true` are defined by `render.yaml`.
External production startup stops with a clear configuration error until the
required sign-in, email, origin, and photo-storage settings are present.

## 3. Set up Google OAuth

Create separate Google OAuth Web applications for staging and production and
add the matching authorised redirect URI to each:

```text
https://your-staging-render-hostname.onrender.com/api/callback
https://your-final-domain.example/api/callback
```

Use the exact environment origin in Google OAuth and `APP_ORIGIN`. Jamvi uses
Google OAuth outside Replit; Replit Auth remains available for Replit
development workflows.

## 4. Move data safely

1. Provision a PostgreSQL database in Render or another managed provider.
2. Take a backup of the current Replit production database before any cutover.
3. Restore that backup into the external database.
4. Run the checked-in Drizzle migrations against the external database:

   ```bash
   corepack pnpm@11.20.0 --filter @workspace/db run migrate
   ```

5. Point staging at the staging database and verify existing workspaces,
   expenses, goals, joint-bank activity, and reports.
6. During final cutover, pause writes, take one final backup, restore it, then
   update the production service's `DATABASE_URL`.

Do not use `push-force` against an existing production database.

## 5. Move private photos

The Replit object-storage sidecar is not present on Render. Configure an
S3-compatible private bucket before starting the external service. New photos
are stored as private `photos/<id>` objects and receive short-lived signed URLs.

Configure the bucket's CORS policy to allow `GET` and `POST` only from the
Jamvi staging and final HTTPS origins. Permit the `Content-Type` request header
for uploads; do not make the bucket or its object list public.

Existing Replit-hosted photos need a verified one-time copy into the new private
bucket using the same `photos/<id>` object names. Before final cutover, add the
destination S3 credentials to the Replit workspace secrets temporarily and run:

```bash
# Read and verify every database-referenced Replit photo first.
corepack pnpm@11.20.0 --filter @workspace/api-server run migrate:legacy-photos

# Copy each photo, then verify target byte count and SHA-256 metadata.
PHOTO_MIGRATION_WRITE=true \
  corepack pnpm@11.20.0 --filter @workspace/api-server run migrate:legacy-photos
```

The command stops on any missing, oversized, unsupported, or mismatched photo.
Do not attach the final domain until the write run completes successfully.

## 6. Verify staging, then release to production

Before changing DNS, confirm:

- The staging service's `/api/healthz` returns successfully.
- Refreshing a marketing route and authenticated routes such as `/app/settings`
  and `/app/reports` opens the correct SPA rather than a 404 page. Confirm
  `/app` redirects to `/app/`.
- Google sign-in completes and returns to the same staging origin.
- Workspace data, invite emails, and monthly-digest sender settings work.
- Private photo upload and viewing work without public bucket access.

After staging passes, merge `staging` into `main`. Confirm the production
service deploys successfully, then add the paid custom domain in Render and
use the DNS records Render provides. Keep production `APP_ORIGIN` and `APP_URL`
on the paid custom domain; keep staging pointed at its generated Render
hostname.

## Release workflow

1. Develop on a feature branch.
2. Merge the feature branch into `staging`.
3. Verify the current `*.onrender.com` staging URL.
4. Merge the verified commit into `main`.
5. Let `jamvi-production` deploy the same commit to the paid domain.

Do not attach the paid domain to the staging service, and do not point staging
at the production database.

## Mobile follow-up

Render hosts the web app and API, not the Expo application. After the Render
domain is live, build a new Expo release with `EXPO_PUBLIC_DOMAIN` set to the
final HTTPS origin and verify native sign-in separately.
