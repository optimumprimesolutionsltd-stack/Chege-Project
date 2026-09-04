/**
 * Unit tests must run on a machine with no database.
 *
 * `@workspace/db` throws at module load when DATABASE_URL is unset, so any
 * unit test that transitively imports it — subscription-catalog pulls in the
 * table definitions in order to query them — fails before a single assertion
 * runs. That is what happened to subscription-packages.test.ts.
 *
 * A placeholder is enough: nothing here opens a connection. pg connects lazily,
 * so the value is only ever read if a test actually queries, and the tests that
 * do are named *.integration.test.ts, excluded from this run, and set a real
 * URL of their own.
 *
 * Set only when absent, so running the integration suite against a real
 * DATABASE_URL still uses it.
 */
process.env.DATABASE_URL ??= "postgres://unit-tests-never-connect";
