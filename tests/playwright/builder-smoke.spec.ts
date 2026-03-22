import { test, expect } from "@playwright/test";

/**
 * Builder Smoke Tests
 *
 * Builder pages (/projects, /scoreboard, /templates) now require
 * authentication. Unauthenticated requests are redirected to /auth/login.
 * These tests verify that the middleware redirect works and that
 * auth pages render correctly.
 */

// ── Protected Builder Pages (middleware redirect) ────────────

test("projects page redirects unauthenticated to login", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("new project page redirects unauthenticated to login", async ({ page }) => {
  await page.goto("/projects/new");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("templates page redirects unauthenticated to login", async ({ page }) => {
  await page.goto("/templates");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("scoreboard page redirects unauthenticated to login", async ({ page }) => {
  await page.goto("/scoreboard");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("settings page redirects unauthenticated to login", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("project detail redirects unauthenticated to login", async ({ page }) => {
  await page.goto("/projects/00000000-0000-0000-0000-000000000000");
  await expect(page).toHaveURL(/\/auth\/login/);
});

// ── Protected Generated Pages (middleware redirect) ──────────

test("dashboard redirects unauthenticated to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("users page redirects unauthenticated to login", async ({ page }) => {
  await page.goto("/users");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("billing page redirects unauthenticated to login", async ({ page }) => {
  await page.goto("/billing");
  await expect(page).toHaveURL(/\/auth\/login/);
});

// ── Auth Pages (public, should render) ───────────────────────

test("login page renders with email and password inputs", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.locator("body")).toContainText("おかえりなさい");

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
});

test("signup page renders with form", async ({ page }) => {
  await page.goto("/auth/signup");
  await expect(page.locator("body")).toContainText("アカウント作成");

  const inputs = await page.locator("input").count();
  expect(inputs).toBeGreaterThanOrEqual(2);
});

test("reset password page renders", async ({ page }) => {
  await page.goto("/auth/reset-password");
  await expect(page.locator("body")).toContainText("パスワードリセット");

  const emailInput = page.locator('input[type="email"]');
  await expect(emailInput).toBeVisible();
});

// ── Landing page (unauthenticated) ──────────────────────────

test("root shows landing page for unauthenticated users", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toContainText("AIでSaaSを");
});
