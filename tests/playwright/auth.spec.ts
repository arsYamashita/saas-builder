import { test, expect } from "@playwright/test";

test("signup page renders", async ({ page }) => {
  await page.goto("/auth/signup");
  await expect(page.locator("body")).toContainText("アカウント作成");
});

test("login page renders", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.locator("body")).toContainText("おかえりなさい");
});
