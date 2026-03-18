import { test } from "@playwright/test";
import {
  navigateAndWait,
  expectNoCrash,
  expectMainContentVisible,
  expectInteractiveElements,
} from "./smoke-helpers";

/**
 * Membership Content Affiliate — Template-specific smoke tests
 *
 * Validates that content/affiliate-specific UI paths render correctly.
 */

test.describe("membership_content_affiliate smoke", () => {
  test("content-listing: content listing page renders", async ({ page }) => {
    await navigateAndWait(page, "/content");
    await expectNoCrash(page);
    await expectMainContentVisible(page);
  });

  test("affiliate-entry: affiliate area accessible", async ({ page }) => {
    await navigateAndWait(page, "/affiliate");
    await expectNoCrash(page);
    await expectInteractiveElements(page, 1);
  });
});
