# Applying the CI workflow rename

The job `Verify staging category integrity` reads the repository secret
`STAGING_DATABASE_URL`. On 19 September 2026 that secret turned out to hold a
**production** connection string: the check had been reporting on live data for
weeks while every failure was read as a staging problem, and the verifier had
been printing `"database": "jamvi"` in its own output the whole time.

The scripts are renamed in this PR. The workflow cannot be: pushes to
`.github/workflows/*` are rejected for want of the `workflow` token scope, so
it comes as a patch instead.

## Apply it

```bash
git apply docs/ci-workflow-rename.patch
git add .github/workflows/ci.yml
git commit -m "Rename the category check to say which database it reads"
```

The patch renames the job to `Verify category integrity`, reads
`CATEGORY_CHECK_DATABASE_URL` and falls back to `STAGING_DATABASE_URL`, and
calls the renamed script. Nothing breaks before the new secret exists.

## Then decide which of these you want

**Point it at a real staging database.** Add a `CATEGORY_CHECK_DATABASE_URL`
secret holding a staging connection string. The fallback means the old secret
keeps working until you do, and can be deleted afterwards.

**Or keep it on production deliberately.** Then it is a production integrity
monitor, which is a reasonable thing to have — the rename is the whole fix, and
`STAGING_DATABASE_URL` should be renamed to `CATEGORY_CHECK_DATABASE_URL` so
nobody reads it as staging again.

Either way the check now names the database in its failure line, so it cannot
be misread the same way twice.
