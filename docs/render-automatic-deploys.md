# Jamvi: Configure Automatic Deployments in Render

This guide configures the Render service that publishes Jamvi at [jamvi.co.ke/app/](https://jamvi.co.ke/app/) to deploy automatically whenever a change is pushed to the production branch.

## Current Jamvi deployment

The repository and service should remain configured as follows:

| Setting | Value |
|---|---|
| GitHub repository | `optimumprimesolutionsltd-stack/Chege-Project` |
| Production branch | `main` |
| Render Blueprint | `jamvi` |
| Render service | `jamvi` |
| Runtime | Node |
| Region | Frankfurt |
| Health check | `/api/healthz` |
| Public app URL | `https://jamvi.co.ke/app/` |

The repository already contains a `render.yaml` Blueprint definition with `branch: main` and automatic deployment enabled. The dashboard settings should be checked because service-level settings can differ from the repository file.

## Part 1: Confirm the GitHub connection

1. Sign in to the [Render Dashboard](https://dashboard.render.com).
2. Open the **My Workspace** workspace shown in the Render screenshot.
3. Open **Blueprints** and select **jamvi**.
4. Confirm the Blueprint shows:
   - Repository: `optimumprimesolutionsltd-stack / Chege-Project`
   - Branch: `main`
   - Service: `jamvi`
5. If Render displays a repository access warning, open the GitHub connection settings and re-authorize Render for the `optimumprimesolutionsltd-stack/Chege-Project` repository.

Do not create a second Blueprint for the same service. Render recommends managing a resource from only one Blueprint because multiple Blueprints can overwrite one another's configuration.

## Part 2: Enable automatic Blueprint sync

Blueprint sync controls whether changes to the `render.yaml` infrastructure definition are applied automatically.

1. From the **jamvi** Blueprint page, open **Settings**.
2. Find **Auto Sync**.
3. Set it to **Yes** or **Enabled**.
4. Save the setting.

This is separate from service auto-deploy. Auto Sync is needed when the `render.yaml` file itself changes. If Auto Sync is disabled, use **Manual sync** to apply Blueprint changes.

## Part 3: Enable automatic service deploys

1. Open the **jamvi** service from the Blueprint resource list.
2. Open the service **Settings** page.
3. Scroll to **Build & Deploy**.
4. Find **Auto-Deploy**.
5. Select **On Commit**.
6. Confirm the linked branch is `main`.
7. Save the changes if Render prompts you.

Use **On Commit** for the current Jamvi workflow. This deploys a new build whenever code is pushed or merged into `main`.

Render also offers **After CI Checks Pass**, but that option should only be selected after GitHub Actions or another supported CI provider is reliably producing checks for every commit. If Render detects zero checks, it will not deploy in that mode.

## Part 4: Verify the build and start commands

Because Chege-Project is a pnpm monorepo, the service must build from the repository root. In the `jamvi` service settings, confirm the following values:

**Root Directory**

```text
/
```

Leave it blank if Render represents the repository root as an empty value.

**Build Command**

```bash
corepack pnpm@11.20.0 install --frozen-lockfile --prod=false --config.strictDepBuilds=false && corepack pnpm@11.20.0 run build:render
```

**Start Command**

```bash
corepack pnpm@11.20.0 --filter @workspace/api-server run start
```

**Health Check Path**

```text
/api/healthz
```

The build command compiles the public Jamvi website, the `/app/` web application, and the API server. The start command launches the API server, which serves the web application when `SERVE_WEB=true`.

Do not change the root directory to `artifacts/family-budget`. The frontend depends on workspace packages and the API service, so building from the repository root is required by the current monorepo setup.

## Part 5: Confirm required environment variables

Open the service **Environment** page and verify that the existing production values are present. Do not place secret values in GitHub or in `render.yaml`.

The service should have values for at least:

- `NODE_VERSION=24`
- `NODE_ENV=production`
- `SERVE_WEB=true`
- `AUTH_PROVIDER=google`
- `ISSUER_URL=https://accounts.google.com`
- `APP_ORIGIN=https://jamvi.co.ke`
- `APP_URL=https://jamvi.co.ke`
- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- S3/photo-storage variables, if production photo storage is enabled

Also check `ADDITIONAL_ORIGINS` if the generated Render hostname should remain usable. Any additional login hostname must be registered as an approved redirect URI in the Google OAuth client.

Never replace `DATABASE_URL` casually: the existing `jamvi-db` contains live user data.

## Part 6: Test automatic deployment safely

Use a small, harmless change on a feature branch or a normal approved change destined for `main`.

1. Make the change locally.
2. Run the appropriate validation commands:

   ```bash
   pnpm exec tsc -p lib/replit-auth-web/tsconfig.json
   pnpm --filter @workspace/family-budget run typecheck
   pnpm --filter @workspace/family-budget run build
   ```

3. Commit and push to `main`, or merge a pull request into `main`.
4. In Render, open the `jamvi` service and view **Events**.
5. Confirm Render creates a deploy automatically for the new commit.
6. Open the deploy details and confirm:
   - The commit SHA matches the pushed commit.
   - Install completes successfully.
   - `build:render` completes successfully.
   - The health check passes.
   - The service becomes **Live** or **Deployed**.

## Part 7: Verify the live Jamvi app

After Render reports a successful deployment, check:

1. [Public website](https://jamvi.co.ke/)
2. [Jamvi app login](https://jamvi.co.ke/app/)
3. If an authenticated test account is available, sign in and verify the onboarding screens:
   - Personal, Shared, or Both
   - Persona or use case
   - Budget duration
   - Purpose-specific categories
   - Custom category entry
   - Personalized income sources
   - Friends or roommates Shared-budget purpose

To check that the browser received the current frontend bundle, inspect the HTML source and note the `/app/assets/index-<hash>.js` filename. A new frontend build normally produces a changed hashed asset filename.

## Part 8: Understand Manual Sync versus Manual Deploy

These controls have different purposes:

| Action | Use it for |
|---|---|
| **Manual sync** | Applying changes to the Render Blueprint, especially `render.yaml` configuration changes |
| **Manual Deploy → Deploy latest commit** | Deploying the latest code when service auto-deploy is disabled or did not trigger |
| **On Commit** | Automatically deploying every push or merge to the linked branch |
| **After CI Checks Pass** | Automatically deploying only after supported CI checks pass |

For normal Jamvi code changes, **On Commit** is the setting that removes the need for manual deployment.

## Troubleshooting

### A push does not create a deploy

Check that:

- The push went to `main`, not another branch.
- Auto-Deploy is set to **On Commit**.
- Render is still connected to the correct GitHub repository.
- The GitHub connection has permission to read the repository.
- The commit was not intentionally skipped.
- The service is not paused or suspended.
- The service Events page does not show a failed build or ignored deploy.

### Render deploys but old UI is still visible

Check the deploy commit SHA first. If it is correct:

- Hard-refresh the browser.
- Open a private window.
- Verify the HTML points to the newest hashed JavaScript asset.
- Check Cloudflare and Render response headers.
- Confirm the deploy finished after the GitHub push, not before it.

### Blueprint changes do not apply

Check **Blueprint Settings → Auto Sync**. If it is disabled, click **Manual sync**. Remember that Blueprint sync and service auto-deploy are separate settings.

### Deploy fails during the build

Run the same commands locally from the repository root. Common causes include:

- A changed lockfile that was not committed
- A workspace package declaration that was not built
- Incorrect Node or pnpm versions
- A missing production environment variable
- A changed monorepo root directory

## Recommended Jamvi configuration

For the current single-service production setup, use:

- Blueprint Auto Sync: **Enabled**
- Service Auto-Deploy: **On Commit**
- Linked branch: **main**
- Root directory: **Repository root**
- Build command: the monorepo `build:render` command above
- Start command: the API server filter command above
- Health check: `/api/healthz`
- Database: keep the existing `jamvi-db`; do not recreate it through a new Blueprint

With these settings, a successful push to `main` should automatically trigger the Jamvi production deployment. Render remains responsible for building and publishing the service; GitHub remains the source of code.

## Official references

- [Render: Deploying on Render](https://render.com/docs/deploys)
- [Render: Blueprints](https://render.com/docs/infrastructure-as-code)
- [Render: Monorepo Support](https://render.com/docs/monorepo-support)
- [Render: Blueprint Specification](https://render.com/docs/blueprint-spec)
