import { test, expect } from "@playwright/test";

test("root page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});
