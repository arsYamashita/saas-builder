import { test, expect } from "@playwright/test";

test("plans page redirects to login without auth", async ({ page }) => {
  await page.goto("/plans");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("new plan page redirects to login without auth", async ({ page }) => {
  await page.goto("/plans/new");
  await expect(page).toHaveURL(/\/auth\/login/);
});
