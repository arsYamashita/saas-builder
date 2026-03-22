import { test, expect } from "@playwright/test";

test("signup page renders", async ({ page }) => {
  await page.goto("/auth/signup");
  await expect(page.locator("body")).toContainText("Create Account");
});

test("login page renders", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.locator("body")).toContainText("Welcome back");
});
