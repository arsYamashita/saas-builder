import { test, expect } from "@playwright/test";

test("content list page renders", async ({ page }) => {
  await page.goto("/content");
  await expect(page.locator("h1")).toContainText("Contents");
});

test("new content page renders", async ({ page }) => {
  await page.goto("/content/new");
  await expect(page.locator("h1")).toContainText("New Content");
});
