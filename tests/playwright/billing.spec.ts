import { test, expect } from "@playwright/test";

test("billing page redirects to login without auth", async ({ page }) => {
  await page.goto("/billing");
  await expect(page).toHaveURL(/\/auth\/login/);
});
