import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL(".", import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["lib/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          fileParallelism: false,
          env: {
            DATABASE_URL:
              process.env.TEST_DATABASE_URL ??
              "postgres://mysignalchain:mysignalchain@127.0.0.1:5433/mysignalchain_test",
            BETTER_AUTH_URL: "http://localhost:3100",
            BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
          },
        },
      },
    ],
  },
});
