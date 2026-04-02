import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    globalSetup: "./src/__tests__/global-setup.ts",
    setupFiles: ["./src/__tests__/setup.ts"],
    testTimeout: 15000,
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5433/dealy_test?schema=public",
    },
  },
});
