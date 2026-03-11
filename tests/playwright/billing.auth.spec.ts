import { test, expect } from "@playwright/test";

test.beforeEach(async () => {
  if (!process.env.TEST_USER_EMAIL) {
    test.skip(true, "TEST_USER_EMAIL not set — skipping authenticated tests");
  }
});

test("billing page loads without redirect", async ({ page }) => {
  await page.goto("/billing");
  // Should NOT redirect to login when authenticated
  await expect(page).not.toHaveURL(/\/auth\/login/);
  // Should have some visible content
  await expect(page.locator("h1, h2, main").first()).toBeVisible({ timeout: 10000 });
});

test("billing page shows plan or subscription section", async ({ page }) => {
  await page.goto("/billing");
  const body = page.locator("body");
  // Billing page shows plans or subscription info
  await expect(body).toContainText(
    /(Billing|プラン|Plan|Subscription|サブスクリプション|Checkout|チェックアウト)/i,
    { timeout: 10000 }
  );
});
