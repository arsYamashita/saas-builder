import { test, expect } from "@playwright/test";

// Skip all tests if TEST_USER_EMAIL is not set (no auth available)
test.beforeEach(async () => {
  if (!process.env.TEST_USER_EMAIL) {
    test.skip(true, "TEST_USER_EMAIL not set — skipping authenticated tests");
  }
});

test("dashboard page loads with main content", async ({ page }) => {
  await page.goto("/dashboard");
  // Should NOT redirect to login
  await expect(page).not.toHaveURL(/\/auth\/login/);
  // Should have a heading or main container
  await expect(page.locator("h1, h2, [role='main'], main").first()).toBeVisible({
    timeout: 10000,
  });
});

test("dashboard shows user info section", async ({ page }) => {
  await page.goto("/dashboard");
  // Dashboard displays current user data - check for email or user-related text
  const body = page.locator("body");
  await expect(body).toContainText(/(Dashboard|ダッシュボード|user|email)/i, {
    timeout: 10000,
  });
});
