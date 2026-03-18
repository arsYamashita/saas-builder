import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // Auth setup (runs first if TEST_USER_EMAIL is set)
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // Public / unauthenticated tests
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/auth\.setup\.ts/, /\.auth\.spec\.ts/, /\.smoke\.spec\.ts/],
      dependencies: ["setup"],
    },
    // Authenticated tests (use saved storageState)
    {
      name: "logged-in",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/playwright/.auth/user.json",
      },
      testMatch: /\.auth\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
