import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "scripts/screenshots",
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 10_000 },
  use: { baseURL: "http://localhost:3000", ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
  webServer: { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});
