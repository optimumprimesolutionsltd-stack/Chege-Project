import { defineConfig } from "vitest/config";

// *.integration.test.ts talk to a real PostgreSQL and expect the schema to
// already exist - they create no tables of their own. They are excluded from
// the default run so `test` works anywhere, including CI, which has no
// database. Run them with `pnpm run test:integration` against a DATABASE_URL
// pointing at a scratch database.
//
// Once the baseline migration exists they can move into CI properly: a
// postgres service container, migrate, then run them. That needs migrations,
// which is why it is not done yet.
const INTEGRATION = "**/*.integration.test.ts";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**", INTEGRATION],
    setupFiles: ["./src/__tests__/setup-env.ts"],
  },
});
