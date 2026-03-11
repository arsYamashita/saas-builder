import { test, expect } from "@playwright/test";

test.beforeEach(async () => {
  if (!process.env.TEST_USER_EMAIL) {
    test.skip(true, "TEST_USER_EMAIL not set — skipping authenticated tests");
  }
});

test("content list page loads without redirect", async ({ page }) => {
  await page.goto("/content");
  // Should NOT redirect to login when authenticated
  await expect(page).not.toHaveURL(/\/auth\/login/);
  // Should show page content (heading, table, or empty state)
  await expect(
    page.locator("h1, h2, table, [role='main'], main").first()
  ).toBeVisible({ timeout: 10000 });
});

test("content page shows list or empty state", async ({ page }) => {
  await page.goto("/content");
  const body = page.locator("body");
  // Content page shows either a list of content items or "no content" message
  await expect(body).toContainText(
    /(Contents|コンテンツ|New Content|新規|まだありません)/i,
    { timeout: 10000 }
  );
});

test("new content page loads", async ({ page }) => {
  await page.goto("/content/new");
  await expect(page).not.toHaveURL(/\/auth\/login/);
  // Should have a form
  await expect(page.locator("form, input, textarea").first()).toBeVisible({
    timeout: 10000,
  });
});
