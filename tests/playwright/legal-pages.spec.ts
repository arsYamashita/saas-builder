import { test, expect } from "@playwright/test";

test.describe("Privacy Policy page", () => {
  test("loads and displays heading", async ({ page }) => {
    await page.goto("/privacy");
    const heading = page.locator("h1");
    await expect(heading).toContainText("プライバシーポリシー");
  });

  test("displays key policy sections", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("body")).toContainText("個人情報の収集");
    await expect(page.locator("body")).toContainText("利用目的");
    await expect(page.locator("body")).toContainText("第三者への提供");
  });

  test("back link navigates to home", async ({ page }) => {
    await page.goto("/privacy");
    const backLink = page.locator('a:has-text("ホームに戻る")').first();
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL("/");
  });
});

test.describe("Terms of Service page", () => {
  test("loads and displays heading", async ({ page }) => {
    await page.goto("/terms");
    const heading = page.locator("h1");
    await expect(heading).toContainText("利用規約");
  });

  test("displays key terms sections", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("body")).toContainText("第1条（適用）");
    await expect(page.locator("body")).toContainText("第4条（禁止事項）");
    await expect(page.locator("body")).toContainText("第7条（免責事項）");
  });

  test("back link navigates to home", async ({ page }) => {
    await page.goto("/terms");
    const backLink = page.locator('a:has-text("ホームに戻る")').first();
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL("/");
  });
});

test.describe("Contact page", () => {
  test("loads and displays heading", async ({ page }) => {
    await page.goto("/contact");
    const heading = page.locator("h1");
    await expect(heading).toContainText("お問い合わせ");
  });

  test("displays form with required fields", async ({ page }) => {
    await page.goto("/contact");

    const nameInput = page.locator("#name");
    const emailInput = page.locator("#email");
    const inquirySelect = page.locator("#inquiryType");
    const messageTextarea = page.locator("#message");

    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(inquirySelect).toBeVisible();
    await expect(messageTextarea).toBeVisible();
  });

  test("can fill and submit form, shows success message", async ({ page }) => {
    await page.goto("/contact");

    // Fill out the form
    await page.locator("#name").fill("テスト太郎");
    await page.locator("#email").fill("test@example.com");
    await page.locator("#inquiryType").selectOption("bug");
    await page.locator("#message").fill("テスト用のお問い合わせ内容です。");

    // Submit the form
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
    await submitButton.click();

    // Verify success state
    await expect(page.locator("body")).toContainText("送信が完了しました");
    await expect(page.locator("body")).toContainText(
      "お問い合わせいただきありがとうございます",
    );
  });

  test("back link navigates to home", async ({ page }) => {
    await page.goto("/contact");
    const backLink = page.locator('a:has-text("ホームに戻る")').first();
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL("/");
  });
});
