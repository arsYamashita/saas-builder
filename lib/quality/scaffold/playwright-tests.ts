export function getScaffoldAuthSpec() {
  return `import { test, expect } from "@playwright/test";

test("root page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});
`;
}

export function getScaffoldSmokeSpec() {
  return `import { test, expect } from "@playwright/test";

test("root page is reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\\//);
});
`;
}
