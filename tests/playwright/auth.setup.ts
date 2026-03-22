/**
 * Auth Setup for Playwright
 *
 * Logs in with test credentials and saves browser state for authenticated tests.
 * Requires TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables.
 *
 * If env vars are not set, this setup is skipped gracefully.
 */

import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, ".auth", "user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    console.log("⚠ TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping auth setup");
    await page.context().storageState({ path: authFile });
    return;
  }

  // Dismiss any alert dialogs (login errors)
  page.on("dialog", async (dialog) => {
    console.log(`⚠ Dialog appeared: ${dialog.message()}`);
    await dialog.dismiss();
  });

  await page.goto("/auth/login");
  await expect(page.locator("body")).toContainText("おかえりなさい", { timeout: 10000 });

  // Fill login form
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);

  // Click submit and wait for navigation
  await page.getByRole("button", { name: /サインイン/i }).click();

  // Wait for redirect — the login page does router.push("/dashboard")
  // Use a longer timeout as the server-side auth cookie setup can be slow
  await page.waitForURL(/\/(dashboard|projects)/, { timeout: 30000 });

  // Save auth state
  await page.context().storageState({ path: authFile });
});
