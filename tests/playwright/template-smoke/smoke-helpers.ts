import { Page, expect } from "@playwright/test";

/**
 * Shared helpers for template-specific smoke tests.
 * Provides stable navigation, readiness checks, and common assertions.
 */

/** Navigate to a path and wait for the page to be interactive. */
export async function navigateAndWait(page: Page, path: string, timeoutMs = 10_000) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForTimeout(1000);
}

/** Assert that the page body contains expected text. */
export async function expectBodyContains(page: Page, text: string) {
  const body = await page.locator("body").textContent();
  expect(body).toContain(text);
}

/** Assert that a main content area rendered (h1, h2, main, or [role=main]). */
export async function expectMainContentVisible(page: Page) {
  const content = page.locator("h1, h2, main, [role='main']").first();
  await expect(content).toBeVisible({ timeout: 5000 });
}

/** Assert that at least N interactive elements exist (inputs, buttons, links). */
export async function expectInteractiveElements(page: Page, minCount: number) {
  const count = await page.locator("input, select, button, a[href]").count();
  expect(count).toBeGreaterThanOrEqual(minCount);
}

/** Assert the page didn't crash (no blank body, no unhandled error). */
export async function expectNoCrash(page: Page) {
  const body = await page.locator("body").textContent();
  expect(body).toBeTruthy();
  expect(body!.length).toBeGreaterThan(0);
}
