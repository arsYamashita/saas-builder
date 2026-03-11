import { test, expect } from "@playwright/test";

test("content page redirects to login without auth", async ({ page }) => {
  await page.goto("/content");
  await expect(page).toHaveURL(/\/auth\/login/);
});
