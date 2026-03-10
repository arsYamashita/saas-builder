import { test, expect } from "@playwright/test";

test("root page is reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\//);
});
