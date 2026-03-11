import { test, expect } from "@playwright/test";

test.beforeEach(async () => {
  if (!process.env.TEST_USER_EMAIL) {
    test.skip(true, "TEST_USER_EMAIL not set — skipping authenticated tests");
  }
});

test("projects page accessible when authenticated", async ({ page }) => {
  await page.goto("/projects");
  // Builder pages work without auth too, but verify they still work with auth
  await expect(page).not.toHaveURL(/\/auth\/login/);
  const body = page.locator("body");
  await expect(body).toContainText(/(Projects|プロジェクト)/i, {
    timeout: 10000,
  });
});

test("scoreboard page accessible when authenticated", async ({ page }) => {
  await page.goto("/scoreboard");
  await expect(page).not.toHaveURL(/\/auth\/login/);
  const body = page.locator("body");
  await expect(body).toContainText(/(Scoreboard|スコアボード|Template)/i, {
    timeout: 10000,
  });
});
