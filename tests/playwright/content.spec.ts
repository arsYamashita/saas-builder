import { test, expect } from "@playwright/test";

test("content list page redirects to login without auth", async ({ page }) => {
  await page.goto("/content");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("new content page redirects to login without auth", async ({ page }) => {
  await page.goto("/content/new");
  await expect(page).toHaveURL(/\/auth\/login/);
});
