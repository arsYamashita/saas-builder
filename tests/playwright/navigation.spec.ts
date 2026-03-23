import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("loads with hero text", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText("AIでSaaSを");
  });

  test("displays SaaS Builder branding in header", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toContainText("SaaS Builder");
  });

  test("displays feature sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#features")).toBeAttached();
    await expect(page.locator("#how-it-works")).toBeAttached();
    await expect(page.locator("#templates")).toBeAttached();
  });
});

test.describe("Header navigation", () => {
  test("anchor links to sections exist", async ({ page }) => {
    await page.goto("/");

    // Desktop nav links (anchor links to sections on the same page)
    const featuresLink = page.locator('nav a[href="#features"]');
    const howItWorksLink = page.locator('nav a[href="#how-it-works"]');
    const templatesLink = page.locator('nav a[href="#templates"]');

    await expect(featuresLink).toBeAttached();
    await expect(howItWorksLink).toBeAttached();
    await expect(templatesLink).toBeAttached();
  });

  test("login button links to /auth/login", async ({ page }) => {
    await page.goto("/");
    const loginLink = page.locator('nav a[href="/auth/login"]');
    await expect(loginLink).toBeVisible();
  });

  test("signup button links to /auth/signup", async ({ page }) => {
    await page.goto("/");
    const signupLink = page.locator('nav a[href="/auth/signup"]');
    await expect(signupLink).toBeVisible();
  });
});

test.describe("Footer navigation", () => {
  test("footer links to legal pages exist", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");

    const privacyLink = footer.locator('a[href="/privacy"]');
    const termsLink = footer.locator('a[href="/terms"]');
    const contactLink = footer.locator('a[href="/contact"]');

    await expect(privacyLink).toBeVisible();
    await expect(termsLink).toBeVisible();
    await expect(contactLink).toBeVisible();
  });

  test("privacy link navigates to privacy page", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await footer.locator('a[href="/privacy"]').click();
    await expect(page).toHaveURL("/privacy");
    await expect(page.locator("h1")).toContainText("プライバシーポリシー");
  });

  test("terms link navigates to terms page", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await footer.locator('a[href="/terms"]').click();
    await expect(page).toHaveURL("/terms");
    await expect(page.locator("h1")).toContainText("利用規約");
  });

  test("contact link navigates to contact page", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await footer.locator('a[href="/contact"]').click();
    await expect(page).toHaveURL("/contact");
    await expect(page.locator("h1")).toContainText("お問い合わせ");
  });
});

test.describe("Auth pages accessibility", () => {
  test("login page is accessible from landing", async ({ page }) => {
    await page.goto("/");
    await page.locator('nav a[href="/auth/login"]').click();
    await expect(page).toHaveURL("/auth/login");
    await expect(page.locator("body")).toContainText("おかえりなさい");
  });

  test("signup page is accessible from landing", async ({ page }) => {
    await page.goto("/");
    await page.locator('nav a[href="/auth/signup"]').click();
    await expect(page).toHaveURL("/auth/signup");
    await expect(page.locator("body")).toContainText("アカウント作成");
  });
});

test.describe("404 page", () => {
  test("shows 404 for nonexistent page", async ({ page }) => {
    await page.goto("/nonexistent-page-that-does-not-exist");
    await expect(page.locator("body")).toContainText("404");
    await expect(page.locator("body")).toContainText("ページが見つかりません");
  });

  test("404 page has link back to home", async ({ page }) => {
    await page.goto("/nonexistent-page-that-does-not-exist");
    const homeLink = page.locator('a[href="/"]');
    await expect(homeLink).toBeVisible();
  });
});
