import { test, expect } from "@playwright/test";

test("content page renders", async ({ page }) => {
  await page.goto("/content");
  await expect(page.locator("h1")).toContainText("Contents");
});
