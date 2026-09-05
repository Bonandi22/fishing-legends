import { defineConfig } from "vitest/config";

// Integration suite: exercises the PostgreSQL repositories and the migration
// runner against a real database. Requires DATABASE_URL (or TEST_DATABASE_URL)
// to point at a throwaway PostgreSQL instance — see compose.yaml / CI.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["backend/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
