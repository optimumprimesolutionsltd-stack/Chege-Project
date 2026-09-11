import { defineConfig } from "vitest/config";

// The counterpart to vitest.config.ts, which excludes *.integration.test.ts
// unconditionally — that exclude wins over any CLI --exclude/include flag, so
// `vitest run --exclude ... 'src/**/*.integration.test.ts'` (the previous
// shape of the test:integration script) always matched zero files. This
// config selects only integration tests instead of trying to un-exclude them.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**"],
    include: ["**/*.integration.test.ts"],
    setupFiles: ["./src/__tests__/setup-env.ts"],
    // These talk to a real database over the network rather than a mock, so
    // the 5s unit-test default is too tight — a test doing several sequential
    // round trips to a remote scratch Postgres can time out on nothing more
    // than latency.
    testTimeout: 20_000,
  },
});
