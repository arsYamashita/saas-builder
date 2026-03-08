import { test, expect } from "@playwright/test";

test("affiliate page renders", async ({ page }) => {
  await page.goto("/affiliate");
  await expect(page.locator("h1")).toContainText("Affiliate");
});
