import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://mysignalchain:mysignalchain@127.0.0.1:5433/mysignalchain_test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The dev server, because the test sign-in is compiled out of production builds.
    command: `node scripts/migrate.mjs && npx next dev --port ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
      E2E_TEST_LOGIN_ENABLED: "true",
    },
  },
});
