# Staging Category Verification

This repository includes a read-only verifier for checking whether the staging PostgreSQL database still contains legacy `Rent` or `Accommodation` category records, normalized category duplicates, or foreign-key violations.

The verifier is intentionally fail-closed. It requires `STAGING_DATABASE_URL` and will not fall back to `DATABASE_URL`, which prevents accidental execution against the live Jamvi database.

## Local execution

From the repository root, set the staging URL in the shell or a protected secret environment and run:

```bash
STAGING_DATABASE_URL='postgresql://…' pnpm --filter @workspace/scripts verify:staging-categories
```

Do not place the URL in a committed file, print it, or include it in logs. In Render, configure `STAGING_DATABASE_URL` only on the staging service or one-off job.

## Render one-off job

Create a one-off job from the Chege-Project repository using the staging service environment. Set the command to:

```bash
pnpm --filter @workspace/scripts verify:staging-categories
```

Ensure the job receives `STAGING_DATABASE_URL` from the staging database, not the live `jamvi-db` service. The script uses a single PostgreSQL connection, a repeatable-read read-only transaction, a 60-second statement timeout, and a five-second lock timeout. It always rolls the transaction back before closing the connection.

## Results

The JSON output includes counts for legacy aliases in the category master, expenses, allocations, joint-account transactions, budget-plan categories, onboarding selections, onboarding allocations, and onboarding preference JSON. It also reports normalized category duplicates and orphaned foreign-key relationships.

A clean result has:

| Check | Expected value |
|---|---:|
| `legacyTotal` | `0` |
| `duplicateTotal` | `0` |
| `foreignKeyTotal` | `0` |
| `passed` | `true` |

The process exits with status `0` only when all three totals are zero. It exits with status `1` when issues are found, status `2` when `STAGING_DATABASE_URL` is missing, and a nonzero status for connection or query failures.

This verifier does not run either category merge migration and cannot update or delete data.

## Pull-request automation

The repository workflow runs this verifier on pull requests opened from branches in the same repository. It intentionally skips forked pull requests so an untrusted fork cannot receive the staging credential. The workflow also declares read-only repository permissions and cancels superseded runs for the same pull request.

Before relying on the check, add `STAGING_DATABASE_URL` as a repository or staging-environment secret in GitHub under **Settings → Secrets and variables → Actions**. Use a staging database URL only. The workflow fails clearly when the secret is absent and never falls back to `DATABASE_URL`.

Because the verifier reads the database, the staging database should contain representative data but should not be used by production services. For stronger isolation, configure the GitHub Actions secret to point to a dedicated staging database or read-only database role.
