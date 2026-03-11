import { test, expect } from "@playwright/test";
import { uniqueName, hasAuthCredentials } from "./helpers/test-data";

/**
 * Plans CRUD tests (authenticated).
 *
 * Prerequisites:
 * - TEST_USER_EMAIL / TEST_USER_PASSWORD set
 * - Test user has admin role in a tenant
 *
 * Full CRUD: Create → Read → Update → Delete
 */

let testPlanName: string;
let updatedPlanName: string;

test.describe.serial("Plans CRUD flow", () => {
  test.beforeAll(() => {
    testPlanName = uniqueName("e2e_plan");
    updatedPlanName = uniqueName("e2e_upd_plan");
  });

  test.beforeEach(async () => {
    if (!hasAuthCredentials()) {
      test.skip(true, "TEST_USER_EMAIL not set — skipping CRUD tests");
    }
  });

  test("1. navigate to plans list", async ({ page }) => {
    await page.goto("/plans");
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await expect(
      page.locator("h1, h2, table").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("2. navigate to new plan form", async ({ page }) => {
    await page.goto("/plans");
    await page.getByRole("link", { name: /New Plan/i }).click();
    await expect(page).toHaveURL(/\/plans\/new/);
    await expect(page.locator("form")).toBeVisible({ timeout: 10000 });
  });

  test("3. create a new plan", async ({ page }) => {
    await page.goto("/plans/new");
    await expect(page.locator("form")).toBeVisible({ timeout: 10000 });

    await page.getByRole("textbox").first().fill(testPlanName);
    await page.getByRole("textbox").nth(1).fill("E2E test plan description");
    await page.getByRole("button", { name: "作成する" }).click();

    await expect(page).toHaveURL(/\/plans$/, { timeout: 15000 });
    await expect(page.locator("body")).toContainText(testPlanName, {
      timeout: 10000,
    });
  });

  test("4. created plan appears in list", async ({ page }) => {
    await page.goto("/plans");
    await expect(page.locator("body")).toContainText(testPlanName, {
      timeout: 10000,
    });
  });

  test("5. edit the plan", async ({ page }) => {
    await page.goto("/plans");
    await expect(page.locator("body")).toContainText(testPlanName, {
      timeout: 10000,
    });

    const row = page.locator("tr", { hasText: testPlanName });
    await row.getByRole("link", { name: /Edit/i }).click();

    await expect(page).toHaveURL(/\/plans\/[^/]+\/edit/);
    const nameInput = page.getByRole("textbox").first();
    await expect(nameInput).toHaveValue(testPlanName, {
      timeout: 10000,
    });

    await nameInput.clear();
    await nameInput.fill(updatedPlanName);
    await page.getByRole("button", { name: "更新する" }).click();

    await expect(page).toHaveURL(/\/plans$/, { timeout: 15000 });
    await expect(page.locator("body")).toContainText(updatedPlanName, {
      timeout: 10000,
    });
  });

  test("6. updated plan reflects in list", async ({ page }) => {
    await page.goto("/plans");
    await expect(page.locator("body")).toContainText(updatedPlanName, {
      timeout: 10000,
    });
    await expect(page.locator("body")).not.toContainText(testPlanName);
  });

  test("7. delete the plan", async ({ page }) => {
    await page.goto("/plans");
    await expect(page.locator("body")).toContainText(updatedPlanName, {
      timeout: 10000,
    });

    page.on("dialog", (dialog) => dialog.accept());

    const row = page.locator("tr", { hasText: updatedPlanName });
    await row.getByRole("button", { name: /Delete/i }).click();

    await expect(page.locator("body")).not.toContainText(updatedPlanName, {
      timeout: 10000,
    });
  });

  test("8. deleted plan no longer in list", async ({ page }) => {
    await page.goto("/plans");
    await expect(page.locator("h1")).toContainText("Plans", {
      timeout: 10000,
    });
    await expect(page.locator("body")).not.toContainText(updatedPlanName);
  });
});
