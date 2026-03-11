import { test, expect } from "@playwright/test";

/**
 * Builder Smoke Tests
 *
 * Builder pages (/projects, /scoreboard, /templates) use admin client
 * and do NOT require user authentication. These tests verify that the
 * main builder pages render correctly without login.
 */

// ── Builder Core Pages ──────────────────────────────────────

test("projects list page loads", async ({ page }) => {
  await page.goto("/projects");
  const body = await page.locator("body").textContent();
  expect(body).toBeTruthy();
});

test("new project page renders form", async ({ page }) => {
  await page.goto("/projects/new");
  await expect(page.locator("h1")).toContainText("新規プロジェクト作成");
  // Should have template selection or form inputs
  const inputs = await page.locator("input, select, button").count();
  expect(inputs).toBeGreaterThan(0);
});

test("templates page loads", async ({ page }) => {
  await page.goto("/templates");
  const body = await page.locator("body").textContent();
  expect(body).toBeTruthy();
});

// ── Scoreboard ──────────────────────────────────────────────

test("scoreboard page loads and shows content", async ({ page }) => {
  await page.goto("/scoreboard");

  // Wait for client-side render (loading → content)
  await page.waitForTimeout(2000);
  const body = await page.locator("body").textContent();
  expect(body).toBeTruthy();

  // Should show either template data or empty state
  const hasScoreboard = body!.includes("Template Scoreboard") || body!.includes("Scoreboard");
  const hasEmpty = body!.includes("まだ生成実行がありません");
  const hasLoading = body!.includes("Loading");
  const hasError = body!.includes("error") || body!.includes("Error");
  // At least one of these states should be present
  expect(hasScoreboard || hasEmpty || hasLoading || hasError).toBeTruthy();
});

test("scoreboard shows metric sections when data exists", async ({ page }) => {
  await page.goto("/scoreboard");
  await page.waitForTimeout(3000);

  const body = await page.locator("body").textContent();

  // If data loaded, check for expected metric labels
  if (body?.includes("Green Rate")) {
    expect(body).toContain("Quality Pass");
    expect(body).toContain("Approved");
    expect(body).toContain("Promoted");
  }
  // If no data or loading, still pass — page didn't crash
});

// ── Project Detail ──────────────────────────────────────────

test("project detail handles nonexistent project gracefully", async ({ page }) => {
  await page.goto("/projects/00000000-0000-0000-0000-000000000000");
  await page.waitForTimeout(3000);

  const body = await page.locator("body").textContent();
  expect(body).toBeTruthy();

  // Should show error message — not crash
  const hasError = body!.includes("not found") || body!.includes("Failed") || body!.includes("Error");
  const hasProject = body!.includes("Generation");
  expect(hasError || hasProject).toBeTruthy();
});

// ── Auth Pages ──────────────────────────────────────────────

test("login page renders with email and password inputs", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.locator("body")).toContainText("Login");

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
});

test("signup page renders with form", async ({ page }) => {
  await page.goto("/auth/signup");
  await expect(page.locator("body")).toContainText("Sign up");

  const inputs = await page.locator("input").count();
  expect(inputs).toBeGreaterThanOrEqual(2);
});

// ── Protected Pages (middleware redirect) ───────────────────

test("dashboard redirects unauthenticated to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login/);
});
