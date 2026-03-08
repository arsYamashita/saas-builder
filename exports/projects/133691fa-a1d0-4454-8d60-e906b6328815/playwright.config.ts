import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright",
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  retries: 0,
});
