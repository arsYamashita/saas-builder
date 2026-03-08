import { test, expect } from "@playwright/test";

test("plans list page renders", async ({ page }) => {
  await page.goto("/plans");
  await expect(page.locator("h1")).toContainText("Plans");
});

test("new plan page renders", async ({ page }) => {
  await page.goto("/plans/new");
  await expect(page.locator("h1")).toContainText("New Plan");
});
