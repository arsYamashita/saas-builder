import { test, expect } from "@playwright/test";

test("affiliate page redirects to login without auth", async ({ page }) => {
  await page.goto("/affiliate");
  await expect(page).toHaveURL(/\/auth\/login/);
});
