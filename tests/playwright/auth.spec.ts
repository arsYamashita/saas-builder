import { test, expect } from "@playwright/test";

test("signup page renders", async ({ page }) => {
  await page.goto("/auth/signup");
  await expect(page.locator("h1")).toContainText("Sign up");
});

test("login page renders", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.locator("h1")).toContainText("Login");
});
