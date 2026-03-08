import { test, expect } from "@playwright/test";

test("billing page renders", async ({ page }) => {
  await page.goto("/billing");
  await expect(page.locator("h1")).toContainText("Billing");
});
