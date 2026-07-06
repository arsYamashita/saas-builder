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
      testIgnore: [/auth\.setup\.ts/, /\.auth\.spec\.ts/],
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
    // WebKit (Safari engine) lane — mirrors "chromium" 1:1 for parity.
    // See docs/testing/webkit-e2e-notes.md for known Chromium/WebKit
    // behavior differences (cookies/ITP/storage/redirects) surfaced while
    // adding this lane.
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testIgnore: [/auth\.setup\.ts/, /\.auth\.spec\.ts/],
      dependencies: ["setup"],
    },
    // Authenticated WebKit tests (use saved storageState). Like "logged-in",
    // every *.auth.spec.ts self-skips via a `TEST_USER_EMAIL` beforeEach
    // guard when no real Supabase test user is configured (local sandbox /
    // forks without the CI secret) — so this project is safe to run
    // everywhere and only exercises real assertions where creds exist.
    {
      name: "logged-in-webkit",
      use: {
        ...devices["Desktop Safari"],
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
