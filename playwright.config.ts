import { defineConfig, devices } from "@playwright/test";

// E2E runs against the development database (reset + seeded in global setup), the Next dev server and the
// real background worker. Providers are the fake adapters – no real money or messages.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, dependencies: ["setup"], testIgnore: /auth\.setup\.ts/ },
  ],
  webServer: [
    { command: "npm run dev", url: "http://localhost:3000/api/health", reuseExistingServer: true, timeout: 180_000 },
    // Set E2E_EXTERNAL_WORKER=1 when a worker is already running (e.g. during local iteration).
    ...(process.env.E2E_EXTERNAL_WORKER ? [] : [{ command: "npm run worker", wait: { stdout: /worker started/ }, reuseExistingServer: false, timeout: 60_000 }]),
  ],
});
