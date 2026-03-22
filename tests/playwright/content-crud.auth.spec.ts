import { test, expect } from "@playwright/test";
import { uniqueName, hasAuthCredentials } from "./helpers/test-data";

/**
 * Content CRUD tests (authenticated).
 *
 * Prerequisites:
 * - TEST_USER_EMAIL / TEST_USER_PASSWORD set
 * - Test user has admin role in a tenant
 *
 * Full CRUD: Create → Read → Update → Delete
 */

// Shared state across serial tests
let testTitle: string;
let updatedTitle: string;

test.describe.serial("Content CRUD flow", () => {
  test.beforeAll(() => {
    testTitle = uniqueName("e2e_content");
    updatedTitle = uniqueName("e2e_upd_content");
  });

  test.beforeEach(async () => {
    if (!hasAuthCredentials()) {
      test.skip(true, "TEST_USER_EMAIL not set — skipping CRUD tests");
    }
  });

  test("1. navigate to content list", async ({ page }) => {
    await page.goto("/content");
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await expect(
      page.locator("h1, h2, table").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("2. navigate to new content form", async ({ page }) => {
    await page.goto("/content");
    await page.getByRole("link", { name: /新規コンテンツ/i }).click();
    await expect(page).toHaveURL(/\/content\/new/);
    await expect(page.locator("form")).toBeVisible({ timeout: 10000 });
  });

  test("3. create a new content item", async ({ page }) => {
    await page.goto("/content/new");
    await expect(page.locator("form")).toBeVisible({ timeout: 10000 });

    await page.getByRole("textbox").first().fill(testTitle);
    await page.locator("textarea").fill("E2E test body content");
    await page.getByRole("button", { name: "作成する" }).click();

    await expect(page).toHaveURL(/\/content$/, { timeout: 15000 });
    await expect(page.locator("body")).toContainText(testTitle, {
      timeout: 10000,
    });
  });

  test("4. created content appears in list", async ({ page }) => {
    await page.goto("/content");
    await expect(page.locator("body")).toContainText(testTitle, {
      timeout: 10000,
    });
  });

  test("5. edit the content item", async ({ page }) => {
    await page.goto("/content");
    await expect(page.locator("body")).toContainText(testTitle, {
      timeout: 10000,
    });

    const row = page.locator("tr", { hasText: testTitle });
    await row.getByRole("link", { name: /編集/i }).click();

    await expect(page).toHaveURL(/\/content\/[^/]+\/edit/);
    const titleInput = page.getByRole("textbox").first();
    await expect(titleInput).toHaveValue(testTitle, {
      timeout: 10000,
    });

    await titleInput.clear();
    await titleInput.fill(updatedTitle);
    await page.getByRole("button", { name: "更新する" }).click();

    await expect(page).toHaveURL(/\/content$/, { timeout: 15000 });
    await expect(page.locator("body")).toContainText(updatedTitle, {
      timeout: 10000,
    });
  });

  test("6. updated content reflects in list", async ({ page }) => {
    await page.goto("/content");
    await expect(page.locator("body")).toContainText(updatedTitle, {
      timeout: 10000,
    });
    await expect(page.locator("body")).not.toContainText(testTitle);
  });

  test("7. delete the content item", async ({ page }) => {
    await page.goto("/content");
    await expect(page.locator("body")).toContainText(updatedTitle, {
      timeout: 10000,
    });

    // Accept the confirm dialog before clicking
    page.on("dialog", (dialog) => dialog.accept());

    const row = page.locator("tr", { hasText: updatedTitle });
    await row.getByRole("button", { name: /削除/i }).click();

    // After delete + router.refresh(), item should disappear
    await expect(page.locator("body")).not.toContainText(updatedTitle, {
      timeout: 10000,
    });
  });

  test("8. deleted content no longer in list", async ({ page }) => {
    await page.goto("/content");
    await expect(page.locator("h1")).toContainText("コンテンツ管理", {
      timeout: 10000,
    });
    await expect(page.locator("body")).not.toContainText(updatedTitle);
  });
});
